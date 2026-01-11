//! Data migration module for handling app data directory relocation
//!
//! This module handles the migration from the old application data directory
//! to the new standardized directory name on Windows:
//!
//! Old: %APPDATA%\com.itsupport.requester.solidjs
//! New: %APPDATA%\supportcenter.requester
//!
//! Migration strategy:
//! - Runs once on app startup
//! - Copies all data from old to new location (if old exists and new doesn't)
//! - Leaves old directory intact (manual cleanup by user if desired)
//! - Logs migration steps for debugging

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Old application identifier (deprecated)
/// New identifier is "supportcenter.requester" (defined in tauri.conf.json)
const OLD_APP_IDENTIFIER: &str = "com.itsupport.requester.solidjs";

// ============================================================================
// PUBLIC API
// ============================================================================

/// Perform data migration from old app data directory to new one
///
/// This function is idempotent and safe to call multiple times.
/// It will only migrate data once if the conditions are met.
///
/// # Arguments
/// * `app` - Tauri app handle for path resolution
///
/// # Returns
/// * `Ok(MigrationResult)` - Migration result with details
/// * `Err(String)` - Error message if migration failed critically
#[derive(Debug, Clone, serde::Serialize)]
pub struct MigrationResult {
    /// Whether migration was performed
    pub migrated: bool,
    /// Reason for migration result
    pub reason: String,
    /// Number of files copied (if migration occurred)
    pub files_copied: usize,
    /// Old directory path (if existed)
    pub old_path: Option<String>,
    /// New directory path
    pub new_path: Option<String>,
}

pub fn migrate_app_data(app: &AppHandle) -> Result<MigrationResult, String> {
    println!("[Migration] Starting app data migration check...");

    // Get the new app data directory (current location)
    let new_app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get new app data directory: {}", e))?;

    // Construct the old app data directory path
    let old_app_data = get_old_app_data_dir()
        .ok_or_else(|| "Failed to determine old app data directory".to_string())?;

    println!("[Migration] Checking paths:");
    println!("  Old: {}", old_app_data.display());
    println!("  New: {}", new_app_data.display());

    // Check if migration is needed
    let old_exists = old_app_data.exists();
    let new_exists = new_app_data.exists();

    // Case 1: Old doesn't exist - no migration needed (fresh install)
    if !old_exists {
        println!("[Migration] Old directory doesn't exist - no migration needed (fresh install)");
        return Ok(MigrationResult {
            migrated: false,
            reason: "Fresh installation - old directory does not exist".to_string(),
            files_copied: 0,
            old_path: Some(old_app_data.display().to_string()),
            new_path: Some(new_app_data.display().to_string()),
        });
    }

    // Case 2: Both exist - migration already completed previously
    if old_exists && new_exists {
        println!("[Migration] Both directories exist - migration already completed");
        return Ok(MigrationResult {
            migrated: false,
            reason: "Migration already completed in previous run".to_string(),
            files_copied: 0,
            old_path: Some(old_app_data.display().to_string()),
            new_path: Some(new_app_data.display().to_string()),
        });
    }

    // Case 3: Old exists, new doesn't - perform migration
    println!("[Migration] Old directory exists, new doesn't - performing migration...");

    // Create new directory
    fs::create_dir_all(&new_app_data)
        .map_err(|e| format!("Failed to create new app data directory: {}", e))?;

    // Copy all files and subdirectories
    let files_copied = copy_directory_contents(&old_app_data, &new_app_data)
        .map_err(|e| format!("Failed to copy directory contents: {}", e))?;

    println!("[Migration] ✅ Migration completed successfully!");
    println!("  Files copied: {}", files_copied);
    println!("  Old directory preserved at: {}", old_app_data.display());

    Ok(MigrationResult {
        migrated: true,
        reason: format!("Migrated {} files from old location", files_copied),
        files_copied,
        old_path: Some(old_app_data.display().to_string()),
        new_path: Some(new_app_data.display().to_string()),
    })
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Get the old app data directory path
///
/// On Windows: %APPDATA%\com.itsupport.requester.solidjs
/// On other platforms: Not supported (returns None)
fn get_old_app_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // Get %APPDATA% directory
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let mut path = PathBuf::from(appdata);
            path.push(OLD_APP_IDENTIFIER);
            return Some(path);
        }
    }

    None
}

/// Recursively copy directory contents from source to destination
///
/// # Arguments
/// * `src` - Source directory path
/// * `dst` - Destination directory path
///
/// # Returns
/// * `Ok(usize)` - Number of files copied
/// * `Err(std::io::Error)` - IO error
fn copy_directory_contents(src: &PathBuf, dst: &PathBuf) -> Result<usize, std::io::Error> {
    let mut files_copied = 0;

    // Iterate through all entries in source directory
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dest_path = dst.join(&file_name);

        if path.is_dir() {
            // Recursively copy subdirectory
            println!("[Migration]   Copying directory: {}", file_name.to_string_lossy());
            fs::create_dir_all(&dest_path)?;
            files_copied += copy_directory_contents(&path, &dest_path)?;
        } else {
            // Copy file
            println!("[Migration]   Copying file: {}", file_name.to_string_lossy());
            fs::copy(&path, &dest_path)?;
            files_copied += 1;
        }
    }

    Ok(files_copied)
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "windows")]
    fn test_get_old_app_data_dir() {
        let old_dir = get_old_app_data_dir();
        assert!(old_dir.is_some());

        let path = old_dir.unwrap();
        assert!(path.to_string_lossy().contains("com.itsupport.requester.solidjs"));
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn test_get_old_app_data_dir_non_windows() {
        let old_dir = get_old_app_data_dir();
        assert!(old_dir.is_none());
    }
}
