//! SMB file operations for copying installers to remote machines.
//!
//! Uses Windows native APIs (WNetAddConnection2W, CopyFileW) for
//! authenticated SMB access to ADMIN$ shares.

use std::time::Duration;

use thiserror::Error;
use tracing::{debug, error, info, instrument, warn};

use crate::credentials::Credential;

/// Errors from SMB operations
#[derive(Debug, Error)]
pub enum SmbError {
    #[error("Connection failed to {path}: {message}")]
    ConnectionFailed { path: String, message: String },

    #[error("File copy failed from {src_path} to {dest_path}: {message}")]
    CopyFailed {
        src_path: String,
        dest_path: String,
        message: String,
    },

    #[error("File deletion failed for {path}: {message}")]
    DeleteFailed { path: String, message: String },

    #[error("Path not found: {0}")]
    PathNotFound(String),

    #[error("Access denied to {0}")]
    AccessDenied(String),

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Timeout during {operation}")]
    Timeout { operation: String },

    #[error("Invalid path format: {0}")]
    InvalidPath(String),
}

/// SMB connection manager
pub struct SmbConnection {
    /// UNC path of the connection (e.g., \\server\share)
    unc_path: String,
    /// Whether connection is established
    connected: bool,
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{
        ERROR_ACCESS_DENIED, ERROR_ALREADY_ASSIGNED, ERROR_BAD_NETPATH,
        ERROR_INVALID_PASSWORD, ERROR_LOGON_FAILURE, ERROR_SESSION_CREDENTIAL_CONFLICT,
        GetLastError, BOOL, WIN32_ERROR,
    };
    use windows::Win32::NetworkManagement::WNet::{
        WNetAddConnection2W, WNetCancelConnection2W, NETRESOURCEW, RESOURCETYPE_DISK,
    };
    use windows::Win32::Storage::FileSystem::{
        CopyFileW, DeleteFileW, GetFileAttributesW, INVALID_FILE_ATTRIBUTES,
    };

    /// Convert a Rust string to a null-terminated wide string
    fn to_wide_string(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    impl SmbConnection {
        /// Establish an SMB connection to a remote share.
        ///
        /// # Arguments
        /// * `unc_path` - UNC path like `\\server\share` or `\\server\ADMIN$`
        /// * `credentials` - Credentials for authentication
        /// * `timeout` - Connection timeout
        ///
        /// # Returns
        /// An established SMB connection.
        #[instrument(skip(credentials), fields(path = %unc_path))]
        pub fn connect(
            unc_path: &str,
            credentials: &Credential,
            _timeout: Duration,
        ) -> Result<Self, SmbError> {
            let remote_wide = to_wide_string(unc_path);
            let username_wide = to_wide_string(&credentials.username);
            let password_wide = to_wide_string(&credentials.password);

            let net_resource = NETRESOURCEW {
                dwType: RESOURCETYPE_DISK,
                lpRemoteName: PCWSTR::from_raw(remote_wide.as_ptr()),
                lpLocalName: PCWSTR::null(),
                lpProvider: PCWSTR::null(),
                ..Default::default()
            };

            unsafe {
                let result = WNetAddConnection2W(
                    &net_resource,
                    PCWSTR::from_raw(password_wide.as_ptr()),
                    PCWSTR::from_raw(username_wide.as_ptr()),
                    0, // No flags
                );

                match result {
                    0 => {
                        debug!("SMB connection established to {}", unc_path);
                        Ok(Self {
                            unc_path: unc_path.to_string(),
                            connected: true,
                        })
                    }
                    err if WIN32_ERROR(err as u32) == ERROR_ALREADY_ASSIGNED
                        || WIN32_ERROR(err as u32) == ERROR_SESSION_CREDENTIAL_CONFLICT =>
                    {
                        // Connection already exists, that's fine
                        debug!("SMB connection already exists to {}", unc_path);
                        Ok(Self {
                            unc_path: unc_path.to_string(),
                            connected: true,
                        })
                    }
                    err => {
                        let win_err = WIN32_ERROR(err as u32);
                        let message = match win_err {
                            ERROR_ACCESS_DENIED => "Access denied".to_string(),
                            ERROR_BAD_NETPATH => "Network path not found".to_string(),
                            ERROR_INVALID_PASSWORD | ERROR_LOGON_FAILURE => {
                                "Invalid credentials".to_string()
                            }
                            _ => format!("Error code: {}", err),
                        };
                        error!(error = %message, "SMB connection failed");
                        Err(SmbError::ConnectionFailed {
                            path: unc_path.to_string(),
                            message,
                        })
                    }
                }
            }
        }

        /// Disconnect the SMB connection.
        #[instrument(skip(self))]
        pub fn disconnect(&mut self) {
            if !self.connected {
                return;
            }

            let remote_wide = to_wide_string(&self.unc_path);

            unsafe {
                let result = WNetCancelConnection2W(
                    PCWSTR::from_raw(remote_wide.as_ptr()),
                    0,     // No flags
                    true,  // Force disconnect
                );

                if result == 0 {
                    debug!("SMB connection disconnected from {}", self.unc_path);
                } else {
                    warn!(
                        error_code = result,
                        "Failed to disconnect SMB connection"
                    );
                }
            }

            self.connected = false;
        }
    }

    impl Drop for SmbConnection {
        fn drop(&mut self) {
            self.disconnect();
        }
    }

    /// Copy a file from source to destination.
    ///
    /// # Arguments
    /// * `source` - Source file path (can be local or UNC)
    /// * `dest` - Destination file path (can be local or UNC)
    ///
    /// # Returns
    /// Ok(()) if the file was copied successfully.
    #[instrument]
    pub fn copy_file_internal(source: &str, dest: &str) -> Result<(), SmbError> {
        let source_wide = to_wide_string(source);
        let dest_wide = to_wide_string(dest);

        unsafe {
            let result = CopyFileW(
                PCWSTR::from_raw(source_wide.as_ptr()),
                PCWSTR::from_raw(dest_wide.as_ptr()),
                false, // Overwrite if exists
            );

            if result.as_bool() {
                debug!("File copied from {} to {}", source, dest);
                Ok(())
            } else {
                let error = GetLastError();
                let message = match error {
                    ERROR_ACCESS_DENIED => "Access denied".to_string(),
                    _ => format!("Error code: {:?}", error),
                };
                error!(error = %message, "File copy failed");
                Err(SmbError::CopyFailed {
                    src_path: source.to_string(),
                    dest_path: dest.to_string(),
                    message,
                })
            }
        }
    }

    /// Delete a file.
    ///
    /// # Arguments
    /// * `path` - File path to delete (can be local or UNC)
    ///
    /// # Returns
    /// Ok(()) if the file was deleted successfully.
    #[instrument]
    pub fn delete_file_internal(path: &str) -> Result<(), SmbError> {
        let path_wide = to_wide_string(path);

        unsafe {
            let result = DeleteFileW(PCWSTR::from_raw(path_wide.as_ptr()));

            if result.as_bool() {
                debug!("File deleted: {}", path);
                Ok(())
            } else {
                let error = GetLastError();
                let message = format!("Error code: {:?}", error);
                warn!(error = %message, "File deletion failed");
                Err(SmbError::DeleteFailed {
                    path: path.to_string(),
                    message,
                })
            }
        }
    }

    /// Check if a file or directory exists.
    ///
    /// # Arguments
    /// * `path` - Path to check (can be local or UNC)
    ///
    /// # Returns
    /// `true` if the path exists, `false` otherwise.
    pub fn path_exists_internal(path: &str) -> bool {
        let path_wide = to_wide_string(path);

        unsafe {
            let attrs = GetFileAttributesW(PCWSTR::from_raw(path_wide.as_ptr()));
            attrs != INVALID_FILE_ATTRIBUTES
        }
    }
}

#[cfg(not(windows))]
mod mock_impl {
    use super::*;

    impl SmbConnection {
        /// Mock SMB connection for non-Windows platforms.
        #[instrument(skip(_credentials, _timeout), fields(path = %unc_path))]
        pub fn connect(
            unc_path: &str,
            _credentials: &Credential,
            _timeout: Duration,
        ) -> Result<Self, SmbError> {
            info!("[MOCK] Would connect to SMB share: {}", unc_path);
            Ok(Self {
                unc_path: unc_path.to_string(),
                connected: true,
            })
        }

        /// Mock disconnect.
        pub fn disconnect(&mut self) {
            if self.connected {
                info!("[MOCK] Would disconnect from SMB share: {}", self.unc_path);
                self.connected = false;
            }
        }
    }

    impl Drop for SmbConnection {
        fn drop(&mut self) {
            self.disconnect();
        }
    }

    /// Mock file copy.
    #[instrument]
    pub fn copy_file_internal(source: &str, dest: &str) -> Result<(), SmbError> {
        info!("[MOCK] Would copy file from {} to {}", source, dest);
        // Simulate some delay
        std::thread::sleep(std::time::Duration::from_millis(100));
        Ok(())
    }

    /// Mock file deletion.
    #[instrument]
    pub fn delete_file_internal(path: &str) -> Result<(), SmbError> {
        info!("[MOCK] Would delete file: {}", path);
        Ok(())
    }

    /// Mock path existence check.
    pub fn path_exists_internal(_path: &str) -> bool {
        true
    }
}

// Re-export internal functions based on platform
#[cfg(windows)]
use windows_impl::{copy_file_internal, delete_file_internal, path_exists_internal};

#[cfg(not(windows))]
use mock_impl::{copy_file_internal, delete_file_internal, path_exists_internal};

/// Copy a file from source to a remote SMB share.
///
/// This function establishes an SMB connection, copies the file, and cleans up.
///
/// # Arguments
/// * `source_path` - Source file path (UNC path like `\\server\share\file.msi`)
/// * `dest_share` - Destination share path (like `\\target\ADMIN$\Temp`)
/// * `credentials` - Credentials for SMB authentication
/// * `timeout` - Operation timeout
///
/// # Returns
/// The full path to the copied file on the destination.
#[instrument(skip(credentials))]
pub async fn copy_file(
    source_path: &str,
    dest_share: &str,
    credentials: &Credential,
    timeout: Duration,
) -> Result<String, SmbError> {
    // Validate paths
    if !source_path.starts_with("\\\\") {
        return Err(SmbError::InvalidPath(format!(
            "Source must be a UNC path: {}",
            source_path
        )));
    }

    if !dest_share.starts_with("\\\\") {
        return Err(SmbError::InvalidPath(format!(
            "Destination must be a UNC path: {}",
            dest_share
        )));
    }

    // Extract filename from source
    let filename = source_path
        .rsplit('\\')
        .next()
        .ok_or_else(|| SmbError::InvalidPath("Cannot extract filename".to_string()))?;

    let dest_path = format!("{}\\{}", dest_share, filename);

    // Perform SMB operations in blocking task
    let source = source_path.to_string();
    let share = dest_share.to_string();
    let dest = dest_path.clone();
    let creds = credentials.clone();

    tokio::task::spawn_blocking(move || {
        // Connect to destination share
        let _conn = SmbConnection::connect(&share, &creds, timeout)?;

        // Copy the file
        copy_file_internal(&source, &dest)?;

        Ok::<_, SmbError>(())
    })
    .await
    .map_err(|e| SmbError::NetworkError(format!("Task failed: {}", e)))??;

    info!(dest = %dest_path, "File copied successfully");
    Ok(dest_path)
}

/// Delete a file from a remote SMB share.
///
/// # Arguments
/// * `file_path` - Full UNC path to the file to delete
/// * `credentials` - Credentials for SMB authentication
///
/// # Returns
/// Ok(()) if deletion succeeded or file doesn't exist.
#[instrument(skip(credentials))]
pub async fn delete_file(file_path: &str, credentials: &Credential) -> Result<(), SmbError> {
    if !file_path.starts_with("\\\\") {
        return Err(SmbError::InvalidPath(format!(
            "Path must be a UNC path: {}",
            file_path
        )));
    }

    // Extract share path (everything up to the last backslash before filename)
    let share_path = file_path
        .rsplitn(2, '\\')
        .nth(1)
        .ok_or_else(|| SmbError::InvalidPath("Cannot extract share path".to_string()))?
        .to_string();

    let path = file_path.to_string();
    let creds = credentials.clone();

    tokio::task::spawn_blocking(move || {
        // Connect to the share
        let _conn = SmbConnection::connect(&share_path, &creds, Duration::from_secs(30))?;

        // Delete the file (ignore if not found)
        match delete_file_internal(&path) {
            Ok(()) => Ok(()),
            Err(SmbError::DeleteFailed { .. }) => {
                // File might already be deleted, that's OK
                warn!("File may not exist: {}", path);
                Ok(())
            }
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| SmbError::NetworkError(format!("Task failed: {}", e)))?
}

/// Check if a path exists on an SMB share.
///
/// # Arguments
/// * `path` - UNC path to check
/// * `credentials` - Credentials for SMB authentication
///
/// # Returns
/// `true` if the path exists.
#[instrument(skip(credentials))]
pub async fn check_path_exists(path: &str, credentials: &Credential) -> Result<bool, SmbError> {
    if !path.starts_with("\\\\") {
        return Err(SmbError::InvalidPath(format!(
            "Path must be a UNC path: {}",
            path
        )));
    }

    // Extract share path
    let parts: Vec<&str> = path.trim_start_matches("\\\\").splitn(3, '\\').collect();
    if parts.len() < 2 {
        return Err(SmbError::InvalidPath("Invalid UNC path format".to_string()));
    }
    let share_path = format!("\\\\{}\\{}", parts[0], parts[1]);

    let check_path = path.to_string();
    let creds = credentials.clone();

    tokio::task::spawn_blocking(move || {
        // Connect to the share
        let _conn = SmbConnection::connect(&share_path, &creds, Duration::from_secs(30))?;

        Ok::<_, SmbError>(path_exists_internal(&check_path))
    })
    .await
    .map_err(|e| SmbError::NetworkError(format!("Task failed: {}", e)))?
}

/// Extract the filename from a UNC path.
///
/// # Example
/// ```
/// let filename = extract_filename("\\\\server\\share\\installer.msi");
/// assert_eq!(filename, Some("installer.msi"));
/// ```
pub fn extract_filename(path: &str) -> Option<&str> {
    path.rsplit('\\').next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_filename() {
        assert_eq!(
            extract_filename("\\\\server\\share\\file.msi"),
            Some("file.msi")
        );
        assert_eq!(
            extract_filename("\\\\server\\ADMIN$\\Temp\\installer.msi"),
            Some("installer.msi")
        );
        assert_eq!(extract_filename("file.msi"), Some("file.msi"));
    }

    #[test]
    fn test_smb_error_display() {
        let err = SmbError::ConnectionFailed {
            path: "\\\\server\\share".to_string(),
            message: "Access denied".to_string(),
        };
        assert!(err.to_string().contains("server"));
        assert!(err.to_string().contains("Access denied"));
    }
}
