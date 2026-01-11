//! Windows Auto-Start Module
//!
//! Handles enabling/disabling auto-start on Windows user login via Registry.
//! This module provides per-user, non-admin auto-start functionality.
//!
//! Registry Key: HKCU\Software\Microsoft\Windows\CurrentVersion\Run
//! Value Name: App identifier (supportcenter.requester)
//! Value Data: Quoted absolute path to the executable
//!
//! Follows strict idempotency rules:
//! - If entry exists with correct value → do nothing
//! - If entry missing → create it
//! - If entry exists with incorrect value → log warning (do NOT overwrite)

/// App identifier used as the registry value name
const APP_ID: &str = "supportcenter.requester";

/// Result type for autostart operations
#[derive(Debug, Clone, serde::Serialize)]
pub struct AutostartStatus {
    /// Whether auto-start is currently enabled (entry exists with correct path)
    pub enabled: bool,
    /// Whether the entry exists at all
    pub entry_exists: bool,
    /// The current value in registry (if exists)
    pub current_value: Option<String>,
    /// The expected value (quoted executable path)
    pub expected_value: String,
    /// Whether there's a mismatch (entry exists but wrong value)
    pub has_mismatch: bool,
    /// Human-readable status message
    pub message: String,
}

/// Result type for enable operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct AutostartEnableResult {
    /// Whether the operation succeeded
    pub success: bool,
    /// Whether auto-start is now enabled
    pub enabled: bool,
    /// Human-readable result message
    pub message: String,
    /// Whether this was a new entry (vs already existed)
    pub was_created: bool,
}

/// Get the current executable path, properly quoted for Windows
///
/// Returns the absolute path to the currently running executable,
/// wrapped in quotes to handle paths with spaces.
pub fn get_executable_path() -> Result<String, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;

    let path_str = exe_path.to_string_lossy().to_string();

    // Validate the path exists
    if !exe_path.exists() {
        return Err(format!("Executable path does not exist: {}", path_str));
    }

    // Return quoted path for Windows registry (handles spaces in path)
    Ok(format!("\"{}\"", path_str))
}


// ============================================================================
// WINDOWS IMPLEMENTATION
// ============================================================================

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::System::Registry::{
        RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, RegDeleteValueW, RegCloseKey,
        HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ, REG_VALUE_TYPE,
    };
    use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
    use windows::core::PCWSTR;

    /// Registry subkey path for Windows auto-start
    const REGISTRY_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

    /// Convert a Rust string to a null-terminated wide string (UTF-16)
    fn to_wide_string(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    /// Check current autostart status in Windows Registry
    pub fn check_autostart_status() -> Result<AutostartStatus, String> {
        let expected_value = get_executable_path()?;

        unsafe {
            let subkey_wide = to_wide_string(REGISTRY_SUBKEY);
            let mut hkey = windows::Win32::System::Registry::HKEY::default();

            // Try to open the registry key
            let result = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey_wide.as_ptr()),
                0,
                KEY_READ,
                &mut hkey,
            );

            if result.is_err() {
                return Ok(AutostartStatus {
                    enabled: false,
                    entry_exists: false,
                    current_value: None,
                    expected_value,
                    has_mismatch: false,
                    message: "Registry key could not be opened (this is unusual)".to_string(),
                });
            }

            // Query the value
            let value_name_wide = to_wide_string(APP_ID);
            let mut value_type: REG_VALUE_TYPE = REG_VALUE_TYPE(0);
            let mut data_size: u32 = 0;

            // First call to get the size
            let query_result = RegQueryValueExW(
                hkey,
                PCWSTR(value_name_wide.as_ptr()),
                None,
                Some(&mut value_type),
                None,
                Some(&mut data_size),
            );

            let status = if query_result.is_err() {
                // Check if it's just "not found" (expected for first run)
                let err_code = query_result.0 as u32;
                if err_code == ERROR_FILE_NOT_FOUND.0 {
                    AutostartStatus {
                        enabled: false,
                        entry_exists: false,
                        current_value: None,
                        expected_value,
                        has_mismatch: false,
                        message: "Auto-start not configured".to_string(),
                    }
                } else {
                    AutostartStatus {
                        enabled: false,
                        entry_exists: false,
                        current_value: None,
                        expected_value,
                        has_mismatch: false,
                        message: format!("Failed to query registry value (error: {})", err_code),
                    }
                }
            } else {
                // Value exists, read it
                let mut data: Vec<u8> = vec![0u8; data_size as usize];
                let read_result = RegQueryValueExW(
                    hkey,
                    PCWSTR(value_name_wide.as_ptr()),
                    None,
                    Some(&mut value_type),
                    Some(data.as_mut_ptr()),
                    Some(&mut data_size),
                );

                if read_result.is_err() {
                    AutostartStatus {
                        enabled: false,
                        entry_exists: true,
                        current_value: None,
                        expected_value,
                        has_mismatch: true,
                        message: "Registry value exists but could not be read".to_string(),
                    }
                } else {
                    // Convert bytes to UTF-16 string
                    let wide_chars: Vec<u16> = data
                        .chunks_exact(2)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect();

                    // Remove null terminator if present
                    let current_value = String::from_utf16_lossy(&wide_chars)
                        .trim_end_matches('\0')
                        .to_string();

                    // Compare values (case-insensitive for Windows paths)
                    let matches = current_value.eq_ignore_ascii_case(&expected_value);

                    if matches {
                        AutostartStatus {
                            enabled: true,
                            entry_exists: true,
                            current_value: Some(current_value),
                            expected_value,
                            has_mismatch: false,
                            message: "Auto-start is enabled and correctly configured".to_string(),
                        }
                    } else {
                        AutostartStatus {
                            enabled: false,
                            entry_exists: true,
                            current_value: Some(current_value),
                            expected_value,
                            has_mismatch: true,
                            message: "Auto-start entry exists but points to different executable".to_string(),
                        }
                    }
                }
            };

            let _ = RegCloseKey(hkey);
            Ok(status)
        }
    }

    /// Enable auto-start by adding registry entry
    ///
    /// Follows idempotency rules:
    /// - If correct entry exists → do nothing, return success
    /// - If entry missing → create it
    /// - If incorrect entry exists → log warning, do NOT overwrite, return failure
    pub fn enable_autostart() -> Result<AutostartEnableResult, String> {
        // First check current status
        let status = check_autostart_status()?;

        // Case 1: Already correctly enabled
        if status.enabled {
            eprintln!("[autostart] Already enabled and correctly configured");
            return Ok(AutostartEnableResult {
                success: true,
                enabled: true,
                message: "Auto-start already enabled".to_string(),
                was_created: false,
            });
        }

        // Case 2: Entry exists but with wrong value - DO NOT overwrite
        if status.has_mismatch {
            eprintln!("[autostart] WARNING: Registry entry exists with different value");
            eprintln!("[autostart] Current: {:?}", status.current_value);
            eprintln!("[autostart] Expected: {}", status.expected_value);
            eprintln!("[autostart] NOT overwriting to prevent conflicts");
            return Ok(AutostartEnableResult {
                success: false,
                enabled: false,
                message: format!(
                    "Auto-start entry exists with different value. Current: {:?}, Expected: {}. Manual intervention required.",
                    status.current_value,
                    status.expected_value
                ),
                was_created: false,
            });
        }

        // Case 3: Entry doesn't exist - create it
        eprintln!("[autostart] Creating new registry entry");

        unsafe {
            let subkey_wide = to_wide_string(REGISTRY_SUBKEY);
            let mut hkey = windows::Win32::System::Registry::HKEY::default();

            // Open key with write access
            let result = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey_wide.as_ptr()),
                0,
                KEY_WRITE,
                &mut hkey,
            );

            if result.is_err() {
                return Ok(AutostartEnableResult {
                    success: false,
                    enabled: false,
                    message: format!("Failed to open registry key for writing: {:?}", result),
                    was_created: false,
                });
            }

            // Prepare value data
            let value_name_wide = to_wide_string(APP_ID);
            let value_data_wide = to_wide_string(&status.expected_value);
            let value_data_bytes: Vec<u8> = value_data_wide
                .iter()
                .flat_map(|&w| w.to_le_bytes())
                .collect();

            // Set the value
            let set_result = RegSetValueExW(
                hkey,
                PCWSTR(value_name_wide.as_ptr()),
                0,
                REG_SZ,
                Some(&value_data_bytes),
            );

            let _ = RegCloseKey(hkey);

            if set_result.is_err() {
                return Ok(AutostartEnableResult {
                    success: false,
                    enabled: false,
                    message: format!("Failed to set registry value: {:?}", set_result),
                    was_created: false,
                });
            }

            eprintln!("[autostart] Successfully created registry entry");
            eprintln!("[autostart] Key: HKCU\\{}", REGISTRY_SUBKEY);
            eprintln!("[autostart] Value: {} = {}", APP_ID, status.expected_value);

            Ok(AutostartEnableResult {
                success: true,
                enabled: true,
                message: "Auto-start enabled successfully".to_string(),
                was_created: true,
            })
        }
    }

    /// Disable auto-start by removing registry entry
    pub fn disable_autostart() -> Result<AutostartEnableResult, String> {
        let status = check_autostart_status()?;

        // If entry doesn't exist, nothing to do
        if !status.entry_exists {
            return Ok(AutostartEnableResult {
                success: true,
                enabled: false,
                message: "Auto-start was not enabled".to_string(),
                was_created: false,
            });
        }

        unsafe {
            let subkey_wide = to_wide_string(REGISTRY_SUBKEY);
            let mut hkey = windows::Win32::System::Registry::HKEY::default();

            let result = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey_wide.as_ptr()),
                0,
                KEY_WRITE,
                &mut hkey,
            );

            if result.is_err() {
                return Ok(AutostartEnableResult {
                    success: false,
                    enabled: status.enabled,
                    message: format!("Failed to open registry key: {:?}", result),
                    was_created: false,
                });
            }

            let value_name_wide = to_wide_string(APP_ID);
            let delete_result = RegDeleteValueW(hkey, PCWSTR(value_name_wide.as_ptr()));

            let _ = RegCloseKey(hkey);

            if delete_result.is_err() {
                return Ok(AutostartEnableResult {
                    success: false,
                    enabled: status.enabled,
                    message: format!("Failed to delete registry value: {:?}", delete_result),
                    was_created: false,
                });
            }

            eprintln!("[autostart] Successfully removed registry entry");

            Ok(AutostartEnableResult {
                success: true,
                enabled: false,
                message: "Auto-start disabled successfully".to_string(),
                was_created: false,
            })
        }
    }
}

// ============================================================================
// NON-WINDOWS STUB IMPLEMENTATION
// ============================================================================

#[cfg(not(target_os = "windows"))]
mod windows_impl {
    use super::*;

    /// Check autostart status - stub for non-Windows
    pub fn check_autostart_status() -> Result<AutostartStatus, String> {
        let expected_value = get_executable_path().unwrap_or_else(|_| "unknown".to_string());
        Ok(AutostartStatus {
            enabled: false,
            entry_exists: false,
            current_value: None,
            expected_value,
            has_mismatch: false,
            message: "Auto-start is only supported on Windows".to_string(),
        })
    }

    /// Enable autostart - stub for non-Windows
    pub fn enable_autostart() -> Result<AutostartEnableResult, String> {
        Ok(AutostartEnableResult {
            success: false,
            enabled: false,
            message: "Auto-start is only supported on Windows".to_string(),
            was_created: false,
        })
    }

    /// Disable autostart - stub for non-Windows
    pub fn disable_autostart() -> Result<AutostartEnableResult, String> {
        Ok(AutostartEnableResult {
            success: false,
            enabled: false,
            message: "Auto-start is only supported on Windows".to_string(),
            was_created: false,
        })
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

pub use windows_impl::{check_autostart_status, enable_autostart, disable_autostart};
