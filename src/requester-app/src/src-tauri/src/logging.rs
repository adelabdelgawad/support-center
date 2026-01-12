//! Session logging module for persistent debug logs
//!
//! Provides file-based logging that:
//! - Writes structured JSON logs to the app data directory
//! - Supports automatic rotation (5MB max per file, 10 files max)
//! - Is fail-safe and non-blocking for the main thread
//! - Never exposes sensitive data

use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use serde::{Deserialize, Serialize};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Maximum size per log file in bytes (5MB)
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;

/// Maximum number of log files to keep
const MAX_FILE_COUNT: usize = 10;

/// Log directory name within app data
const LOG_DIR_NAME: &str = "logs";

/// Current log file name
const CURRENT_LOG_FILE: &str = "session-current.log";

// ============================================================================
// TYPES
// ============================================================================

/// Log entry structure matching TypeScript format
#[derive(Debug, Serialize, Deserialize)]
pub struct LogEntry {
    pub ts: String,
    pub level: String,
    pub subsystem: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

/// Log file info for rotation management
#[derive(Debug, Serialize)]
pub struct LogFileInfo {
    pub name: String,
    pub size: u64,
    pub modified: u64,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Get the logs directory path within app data
fn get_logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let logs_dir = app_data_dir.join(LOG_DIR_NAME);
    Ok(logs_dir)
}

/// Ensure the logs directory exists
fn ensure_logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let logs_dir = get_logs_dir(app)?;

    if !logs_dir.exists() {
        fs::create_dir_all(&logs_dir)
            .map_err(|e| format!("Failed to create logs directory: {}", e))?;
    }

    Ok(logs_dir)
}

/// Get the current log file path
fn get_current_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let logs_dir = ensure_logs_dir(app)?;
    Ok(logs_dir.join(CURRENT_LOG_FILE))
}

/// Get the size of a file, returning 0 if it doesn't exist
fn get_file_size(path: &PathBuf) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Generate a timestamped archive filename
fn generate_archive_filename() -> String {
    let now = chrono_lite_timestamp();
    format!("session-{}.log", now.replace([':', '.', ' '], "-"))
}

/// Get current timestamp in Cairo timezone (Africa/Cairo, UTC+2)
fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();

    // Add 2 hours for Cairo timezone (UTC+2)
    let cairo_offset_secs = 2 * 3600;
    let secs = now.as_secs() + cairo_offset_secs;
    let millis = now.subsec_millis();

    // Convert to datetime components
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;

    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Calculate year, month, day from days since epoch (1970-01-01)
    let (year, month, day) = days_to_ymd(days_since_epoch as i64);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}+02:00",
        year, month, day, hours, minutes, seconds, millis
    )
}

/// Convert days since epoch to year/month/day
fn days_to_ymd(days: i64) -> (i32, u32, u32) {
    // Simplified calculation for dates from 1970-2100
    let mut remaining_days = days;
    let mut year = 1970i32;

    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let days_in_months: [i64; 12] = if is_leap_year(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 1u32;
    for days_in_month in days_in_months.iter() {
        if remaining_days < *days_in_month {
            break;
        }
        remaining_days -= *days_in_month;
        month += 1;
    }

    let day = (remaining_days + 1) as u32;
    (year, month, day)
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// List all log files sorted by modification time (oldest first)
fn list_log_files(logs_dir: &PathBuf) -> Vec<LogFileInfo> {
    let mut files: Vec<LogFileInfo> = Vec::new();

    if let Ok(entries) = fs::read_dir(logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    let name_str = name.to_string_lossy().to_string();
                    // Only include session log files (not current)
                    if name_str.starts_with("session-") && name_str != CURRENT_LOG_FILE {
                        if let Ok(metadata) = fs::metadata(&path) {
                            let modified = metadata
                                .modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs())
                                .unwrap_or(0);

                            files.push(LogFileInfo {
                                name: name_str,
                                size: metadata.len(),
                                modified,
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort by modification time (oldest first)
    files.sort_by_key(|f| f.modified);
    files
}

/// Rotate the current log file if it exceeds the size limit
fn rotate_if_needed(app: &AppHandle) -> Result<(), String> {
    let current_path = get_current_log_path(app)?;
    let logs_dir = get_logs_dir(app)?;

    let current_size = get_file_size(&current_path);

    if current_size >= MAX_FILE_SIZE {
        // Archive the current file
        let archive_name = generate_archive_filename();
        let archive_path = logs_dir.join(&archive_name);

        fs::rename(&current_path, &archive_path)
            .map_err(|e| format!("Failed to archive log file: {}", e))?;

        eprintln!("[logging] Rotated log file to: {}", archive_name);

        // Enforce max file count
        enforce_max_files(&logs_dir)?;
    }

    Ok(())
}

/// Delete oldest files if we exceed the max count
fn enforce_max_files(logs_dir: &PathBuf) -> Result<(), String> {
    let files = list_log_files(logs_dir);

    // -1 because we reserve space for the current file
    let max_archived = MAX_FILE_COUNT - 1;

    if files.len() > max_archived {
        let to_delete = files.len() - max_archived;
        for file_info in files.iter().take(to_delete) {
            let file_path = logs_dir.join(&file_info.name);
            if let Err(e) = fs::remove_file(&file_path) {
                eprintln!("[logging] Failed to delete old log file {}: {}", file_info.name, e);
            } else {
                eprintln!("[logging] Deleted old log file: {}", file_info.name);
            }
        }
    }

    Ok(())
}

/// Write a log entry to the current log file
fn write_log_entry(app: &AppHandle, entry: &LogEntry) -> Result<(), String> {
    // First, check if rotation is needed
    rotate_if_needed(app)?;

    let current_path = get_current_log_path(app)?;

    // Open file for appending (create if doesn't exist)
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&current_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let mut writer = BufWriter::new(file);

    // Serialize entry to JSON and write with newline
    let json = serde_json::to_string(entry)
        .map_err(|e| format!("Failed to serialize log entry: {}", e))?;

    writeln!(writer, "{}", json)
        .map_err(|e| format!("Failed to write log entry: {}", e))?;

    writer.flush()
        .map_err(|e| format!("Failed to flush log buffer: {}", e))?;

    Ok(())
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

/// Write a log entry to the session log
/// This is the main logging command called from TypeScript
#[tauri::command]
pub fn log_write(
    app: AppHandle,
    level: String,
    subsystem: String,
    message: String,
    context: Option<serde_json::Value>,
) -> Result<(), String> {
    let entry = LogEntry {
        ts: chrono_lite_timestamp(),
        level,
        subsystem,
        message,
        context,
    };

    write_log_entry(&app, &entry)
}

/// Write multiple log entries at once (batch logging)
#[tauri::command]
pub fn log_write_batch(app: AppHandle, entries: Vec<LogEntry>) -> Result<(), String> {
    for entry in entries {
        write_log_entry(&app, &entry)?;
    }
    Ok(())
}

/// Get the logs directory path
#[tauri::command]
pub fn log_get_directory(app: AppHandle) -> Result<String, String> {
    let logs_dir = ensure_logs_dir(&app)?;
    Ok(logs_dir.to_string_lossy().to_string())
}

/// List all log files with their info
#[tauri::command]
pub fn log_list_files(app: AppHandle) -> Result<Vec<LogFileInfo>, String> {
    let logs_dir = ensure_logs_dir(&app)?;
    let mut files = list_log_files(&logs_dir);

    // Also include current file if it exists
    let current_path = logs_dir.join(CURRENT_LOG_FILE);
    if current_path.exists() {
        if let Ok(metadata) = fs::metadata(&current_path) {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            files.push(LogFileInfo {
                name: CURRENT_LOG_FILE.to_string(),
                size: metadata.len(),
                modified,
            });
        }
    }

    Ok(files)
}

/// Read the contents of a specific log file
#[tauri::command]
pub fn log_read_file(app: AppHandle, filename: String) -> Result<String, String> {
    let logs_dir = get_logs_dir(&app)?;

    // Security: ensure filename doesn't contain path traversal
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("Invalid filename".to_string());
    }

    // Only allow reading session log files
    if !filename.starts_with("session-") {
        return Err("Invalid log filename".to_string());
    }

    let file_path = logs_dir.join(&filename);

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read log file: {}", e))
}

/// Get total size of all log files in bytes
#[tauri::command]
pub fn log_get_total_size(app: AppHandle) -> Result<u64, String> {
    let logs_dir = ensure_logs_dir(&app)?;
    let files = list_log_files(&logs_dir);

    let mut total: u64 = files.iter().map(|f| f.size).sum();

    // Add current file size
    let current_path = logs_dir.join(CURRENT_LOG_FILE);
    total += get_file_size(&current_path);

    Ok(total)
}

/// Force rotation of the current log file
#[tauri::command]
pub fn log_force_rotate(app: AppHandle) -> Result<(), String> {
    let current_path = get_current_log_path(&app)?;
    let logs_dir = get_logs_dir(&app)?;

    if current_path.exists() && get_file_size(&current_path) > 0 {
        let archive_name = generate_archive_filename();
        let archive_path = logs_dir.join(&archive_name);

        fs::rename(&current_path, &archive_path)
            .map_err(|e| format!("Failed to archive log file: {}", e))?;

        enforce_max_files(&logs_dir)?;
    }

    Ok(())
}

/// Clear all log files
#[tauri::command]
pub fn log_clear_all(app: AppHandle) -> Result<(), String> {
    let logs_dir = get_logs_dir(&app)?;

    if logs_dir.exists() {
        let entries = fs::read_dir(&logs_dir)
            .map_err(|e| format!("Failed to read logs directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Err(e) = fs::remove_file(&path) {
                    eprintln!("[logging] Failed to delete log file: {}", e);
                }
            }
        }
    }

    Ok(())
}

/// Initialize logging on app startup
/// Writes a session start marker with app info
#[tauri::command]
pub fn log_init(
    app: AppHandle,
    app_version: String,
    os_info: String,
) -> Result<(), String> {
    // Ensure directory exists
    ensure_logs_dir(&app)?;

    // Write session start marker
    let entry = LogEntry {
        ts: chrono_lite_timestamp(),
        level: "INFO".to_string(),
        subsystem: "app".to_string(),
        message: "Session started".to_string(),
        context: Some(serde_json::json!({
            "version": app_version,
            "os": os_info,
            "sessionStart": true
        })),
    };

    write_log_entry(&app, &entry)?;

    eprintln!("[logging] Session logging initialized");
    Ok(())
}
