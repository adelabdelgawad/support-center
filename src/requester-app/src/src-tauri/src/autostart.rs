//! Windows Registry-based Auto-start Module
//!
//! Provides persistent auto-start functionality using Windows Registry.
//! This implementation is platform-specific and only works on Windows.

use serde::Serialize;

/// Auto-start status information
#[derive(Debug, Clone, Serialize)]
pub struct AutostartStatus {
    /// Whether auto-start is currently enabled
    pub enabled: bool,
    /// Whether a registry entry exists
    pub entry_exists: bool,
    /// Human-readable status message
    pub message: String,
}

/// Result of enabling/disabling auto-start
#[derive(Debug, Clone, Serialize)]
pub struct AutostartEnableResult {
    /// Whether the operation succeeded
    pub success: bool,
    /// Whether auto-start is now enabled
    pub enabled: bool,
    /// Human-readable result message
    pub message: String,
    /// Whether a new entry was created (false if already existed)
    pub was_created: bool,
}

/// Registry key path for auto-start
const REGISTRY_RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Get the expected registry value name and executable path for the current app
#[cfg(target_os = "windows")]
fn get_registry_entry_info() -> Result<(String, String), String> {
    use std::env;

    // Get the current executable path
    let exe_path = env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;

    let exe_path_str = exe_path
        .to_str()
        .ok_or_else(|| "Executable path is not valid UTF-8".to_string())?
        .to_string();

    // Use the app name as the registry value name
    let app_name = "SupportCenter";

    Ok((app_name.to_string(), exe_path_str))
}

/// Check current auto-start status
///
/// Returns detailed status including whether auto-start is enabled,
/// whether the registry entry exists, and any mismatch information.
#[cfg(target_os = "windows")]
pub fn check_autostart_status() -> Result<AutostartStatus, String> {
    use windows::Win32::System::Registry::{RegOpenKeyExA, RegQueryValueExA, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_SZ};
    use windows::core::PCSTR;

    let (value_name, expected_exe_path) = get_registry_entry_info()?;

    unsafe {
        // Open the Run key
        let mut h_key: HKEY = HKEY::default();
        let result = RegOpenKeyExA(
            HKEY_CURRENT_USER,
            PCSTR(REGISTRY_RUN_KEY.as_ptr()),
            0,
            KEY_READ,
            &mut h_key,
        );

        if result.is_err() {
            return Ok(AutostartStatus {
                enabled: false,
                entry_exists: false,
                message: "Registry key not accessible".to_string(),
            });
        }

        // Query the value
        let mut buffer = vec![0u8; 512];
        let mut size = buffer.len() as u32;
        let mut reg_type = REG_SZ;

        let result = RegQueryValueExA(
            h_key,
            PCSTR(value_name.as_ptr()),
            None,
            Some(&mut reg_type),
            Some(buffer.as_mut_ptr()),
            Some(&mut size),
        );

        if result.is_err() {
            return Ok(AutostartStatus {
                enabled: false,
                entry_exists: false,
                message: "Auto-start is disabled (no registry entry)".to_string(),
            });
        }

        // Extract the string value from the buffer
        let actual_exe_path = String::from_utf8_lossy(&buffer[..size as usize])
            .trim_end_matches('\0')
            .to_string();

        let enabled = actual_exe_path == expected_exe_path;

        Ok(AutostartStatus {
            enabled,
            entry_exists: true,
            message: if enabled {
                "Auto-start is enabled".to_string()
            } else {
                format!("Registry entry exists but points to different path.\nExpected: {}\nActual: {}", expected_exe_path, actual_exe_path)
            },
        })
    }
}

/// Check current auto-start status (stub for non-Windows)
#[cfg(not(target_os = "windows"))]
pub fn check_autostart_status() -> Result<AutostartStatus, String> {
    Ok(AutostartStatus {
        enabled: false,
        entry_exists: false,
        message: "Auto-start is not supported on this platform".to_string(),
    })
}

/// Enable auto-start on Windows login
///
/// Follows strict idempotency rules:
/// - If entry exists with correct value → do nothing, return success
/// - If entry missing → create it
/// - If entry exists with different value → log warning, DO NOT overwrite
///
/// Returns detailed result including whether entry was newly created.
#[cfg(target_os = "windows")]
pub fn enable_autostart() -> Result<AutostartEnableResult, String> {
    use windows::Win32::System::Registry::{RegOpenKeyExA, RegQueryValueExA, RegSetValueExA, HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_SZ};
    use windows::core::PCSTR;

    let (value_name, exe_path) = get_registry_entry_info()?;

    unsafe {
        // First, check if entry already exists
        let mut h_key: HKEY = HKEY::default();
        let open_result = RegOpenKeyExA(
            HKEY_CURRENT_USER,
            PCSTR(REGISTRY_RUN_KEY.as_ptr()),
            0,
            KEY_READ,
            &mut h_key,
        );

        if open_result.is_ok() {
            // Query existing value
            let mut buffer = vec![0u8; 512];
            let mut size = buffer.len() as u32;
            let mut reg_type = REG_SZ;

            let query_result = RegQueryValueExA(
                h_key,
                PCSTR(value_name.as_ptr()),
                None,
                Some(&mut reg_type),
                Some(buffer.as_mut_ptr()),
                Some(&mut size),
            );

            if query_result.is_ok() {
                let existing_path = String::from_utf8_lossy(&buffer[..size as usize])
                    .trim_end_matches('\0')
                    .to_string();

                if existing_path == exe_path {
                    // Entry already exists with correct value - idempotent success
                    return Ok(AutostartEnableResult {
                        success: true,
                        enabled: true,
                        message: "Auto-start already configured (idempotent)".to_string(),
                        was_created: false,
                    });
                } else {
                    // Entry exists but points to different executable
                    // DO NOT overwrite - report warning to user
                    return Ok(AutostartEnableResult {
                        success: false,
                        enabled: false,
                        message: format!(
                            "Auto-start entry exists but points to different path.\nCurrent: {}\nThis app: {}\n\nPlease remove the existing entry manually and try again.",
                            existing_path, exe_path
                        ),
                        was_created: false,
                    });
                }
            }
        }

        // Entry doesn't exist - create it
        let mut h_key: HKEY = HKEY::default();
        let open_result = RegOpenKeyExA(
            HKEY_CURRENT_USER,
            PCSTR(REGISTRY_RUN_KEY.as_ptr()),
            0,
            KEY_WRITE,
            &mut h_key,
        );

        if open_result.is_err() {
            return Err(format!("Failed to open registry key for writing: {:?}", open_result));
        }

        // Convert exe_path to null-terminated bytes for registry
        let mut exe_path_bytes = exe_path.as_bytes().to_vec();
        exe_path_bytes.push(0); // Null terminator

        let set_result = RegSetValueExA(
            h_key,
            PCSTR(value_name.as_ptr()),
            0,
            REG_SZ,
            Some(&exe_path_bytes),
        );

        if set_result.is_err() {
            return Err(format!("Failed to set registry value: {:?}", set_result));
        }

        Ok(AutostartEnableResult {
            success: true,
            enabled: true,
            message: format!("Auto-start enabled: {}", exe_path),
            was_created: true,
        })
    }
}

/// Enable auto-start (stub for non-Windows)
#[cfg(not(target_os = "windows"))]
pub fn enable_autostart() -> Result<AutostartEnableResult, String> {
    Ok(AutostartEnableResult {
        success: false,
        enabled: false,
        message: "Auto-start is not supported on this platform".to_string(),
        was_created: false,
    })
}

/// Disable auto-start (remove registry entry)
#[cfg(target_os = "windows")]
pub fn disable_autostart() -> Result<AutostartEnableResult, String> {
    use windows::Win32::System::Registry::{RegDeleteValueA, RegOpenKeyExA, HKEY, HKEY_CURRENT_USER, KEY_WRITE};
    use windows::core::PCSTR;

    let (value_name, _) = get_registry_entry_info()?;

    unsafe {
        let mut h_key: HKEY = HKEY::default();
        let open_result = RegOpenKeyExA(
            HKEY_CURRENT_USER,
            PCSTR(REGISTRY_RUN_KEY.as_ptr()),
            0,
            KEY_WRITE,
            &mut h_key,
        );

        if open_result.is_err() {
            return Ok(AutostartEnableResult {
                success: false,
                enabled: false,
                message: "Failed to open registry key".to_string(),
                was_created: false,
            });
        }

        let delete_result = RegDeleteValueA(h_key, PCSTR(value_name.as_ptr()));

        if delete_result.is_err() {
            return Ok(AutostartEnableResult {
                success: false,
                enabled: true,
                message: "Failed to delete registry entry".to_string(),
                was_created: false,
            });
        }

        Ok(AutostartEnableResult {
            success: true,
            enabled: false,
            message: "Auto-start disabled".to_string(),
            was_created: false,
        })
    }
}

/// Disable auto-start (stub for non-Windows)
#[cfg(not(target_os = "windows"))]
pub fn disable_autostart() -> Result<AutostartEnableResult, String> {
    Ok(AutostartEnableResult {
        success: false,
        enabled: false,
        message: "Auto-start is not supported on this platform".to_string(),
        was_created: false,
    })
}
