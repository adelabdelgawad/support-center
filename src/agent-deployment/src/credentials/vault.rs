//! Windows Credential Manager integration for secure credential storage.
//!
//! Uses the Windows Credential Manager (CredRead/CredWrite APIs) to securely
//! store and retrieve credentials. Credentials are automatically zeroed from
//! memory when dropped using the zeroize crate.

use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Credential retrieved from Windows Credential Manager.
///
/// This struct implements `ZeroizeOnDrop` to securely wipe credentials
/// from memory when they go out of scope.
#[derive(Debug, Clone, Zeroize, ZeroizeOnDrop)]
pub struct Credential {
    /// Username (e.g., "DOMAIN\\username" or "username@domain.com")
    pub username: String,
    /// Password or token
    pub password: String,
}

impl Credential {
    /// Create a new credential
    pub fn new(username: String, password: String) -> Self {
        Self { username, password }
    }
}

/// Errors from credential vault operations
#[derive(Debug, Error)]
pub enum VaultError {
    #[error("Credential not found: {0}")]
    NotFound(String),

    #[error("Access denied to credential: {0}")]
    AccessDenied(String),

    #[error("Invalid credential format: {0}")]
    InvalidFormat(String),

    #[error("Windows API error: {0}")]
    WindowsError(String),

    #[error("UTF-16 conversion error")]
    Utf16Error,
}

/// Vault manager for Windows Credential Manager operations
pub struct CredentialVault;

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::ptr;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_NOT_FOUND;
    use windows::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    impl CredentialVault {
        /// Retrieve a credential from Windows Credential Manager.
        ///
        /// # Arguments
        /// * `target_name` - The target name to look up (e.g., "DeploymentWorker:API")
        ///
        /// # Returns
        /// The credential containing username and password, or an error.
        ///
        /// # Example
        /// ```ignore
        /// let cred = CredentialVault::get_credential("DeploymentWorker:API")?;
        /// println!("User: {}", cred.username);
        /// // Password is automatically zeroed when cred is dropped
        /// ```
        pub fn get_credential(target_name: &str) -> Result<Credential, VaultError> {
            unsafe {
                // Convert target name to wide string
                let target_wide: Vec<u16> = target_name
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect();

                let mut p_credential: *mut CREDENTIALW = ptr::null_mut();

                // Read credential from Windows Credential Manager
                let result = CredReadW(
                    PCWSTR::from_raw(target_wide.as_ptr()),
                    CRED_TYPE_GENERIC,
                    0,
                    &mut p_credential,
                );

                if result.is_err() {
                    let error = windows::core::Error::from_win32();
                    if error.code() == ERROR_NOT_FOUND.into() {
                        return Err(VaultError::NotFound(target_name.to_string()));
                    }
                    return Err(VaultError::WindowsError(error.message().to_string()));
                }

                // Safety: We checked that result is Ok, so p_credential is valid
                let credential = &*p_credential;

                // Extract username
                let username = if credential.UserName.is_null() {
                    String::new()
                } else {
                    let username_ptr = credential.UserName.0;
                    let mut len = 0;
                    while *username_ptr.add(len) != 0 {
                        len += 1;
                    }
                    String::from_utf16_lossy(std::slice::from_raw_parts(username_ptr, len))
                };

                // Extract password from CredentialBlob
                let password = if credential.CredentialBlob.is_null() || credential.CredentialBlobSize == 0 {
                    String::new()
                } else {
                    let blob_size = credential.CredentialBlobSize as usize;
                    let blob = std::slice::from_raw_parts(credential.CredentialBlob, blob_size);

                    // Try UTF-8 first (most common)
                    String::from_utf8(blob.to_vec()).unwrap_or_else(|_| {
                        // Fall back to UTF-16 if UTF-8 fails
                        if blob_size % 2 == 0 {
                            let wide: Vec<u16> = blob
                                .chunks_exact(2)
                                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                                .collect();
                            String::from_utf16_lossy(&wide)
                        } else {
                            String::from_utf8_lossy(blob).to_string()
                        }
                    })
                };

                // Free the credential memory
                CredFree(p_credential as *mut _);

                Ok(Credential::new(username, password))
            }
        }

        /// Check if a credential exists in Windows Credential Manager.
        ///
        /// # Arguments
        /// * `target_name` - The target name to check
        ///
        /// # Returns
        /// `true` if the credential exists, `false` otherwise.
        pub fn credential_exists(target_name: &str) -> bool {
            match Self::get_credential(target_name) {
                Ok(_) => true,
                Err(VaultError::NotFound(_)) => false,
                Err(_) => false,
            }
        }

        /// Store a credential in Windows Credential Manager.
        ///
        /// This is primarily for setup/testing purposes.
        ///
        /// # Arguments
        /// * `target_name` - The target name to store under
        /// * `username` - The username
        /// * `password` - The password
        #[cfg(feature = "setup")]
        pub fn store_credential(
            target_name: &str,
            username: &str,
            password: &str,
        ) -> Result<(), VaultError> {
            use windows::Win32::Security::Credentials::{CredWriteW, CRED_PERSIST_LOCAL_MACHINE};

            unsafe {
                let target_wide: Vec<u16> = target_name
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect();

                let username_wide: Vec<u16> = username
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect();

                let password_bytes = password.as_bytes();

                let credential = CREDENTIALW {
                    TargetName: PCWSTR::from_raw(target_wide.as_ptr()),
                    Type: CRED_TYPE_GENERIC,
                    UserName: PCWSTR::from_raw(username_wide.as_ptr()),
                    CredentialBlob: password_bytes.as_ptr() as *mut u8,
                    CredentialBlobSize: password_bytes.len() as u32,
                    Persist: CRED_PERSIST_LOCAL_MACHINE,
                    ..Default::default()
                };

                let result = CredWriteW(&credential, 0);

                if result.is_err() {
                    let error = windows::core::Error::from_win32();
                    return Err(VaultError::WindowsError(error.message().to_string()));
                }

                Ok(())
            }
        }
    }
}

/// Mock implementation for non-Windows platforms (development/testing)
#[cfg(not(windows))]
mod mock_impl {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    // Thread-safe storage for mock credentials
    lazy_static::lazy_static! {
        static ref MOCK_CREDENTIALS: Mutex<HashMap<String, (String, String)>> = {
            let mut m = HashMap::new();
            // Pre-populate with test credentials
            m.insert(
                "DeploymentWorker:API".to_string(),
                ("api-user".to_string(), "api-token-12345".to_string()),
            );
            m.insert(
                "DeploymentWorker:SMB".to_string(),
                ("DOMAIN\\admin".to_string(), "smb-password".to_string()),
            );
            Mutex::new(m)
        };
    }

    impl CredentialVault {
        /// Mock implementation for non-Windows platforms.
        pub fn get_credential(target_name: &str) -> Result<Credential, VaultError> {
            let credentials = MOCK_CREDENTIALS.lock().unwrap();

            if let Some((username, password)) = credentials.get(target_name) {
                Ok(Credential::new(username.clone(), password.clone()))
            } else {
                Err(VaultError::NotFound(target_name.to_string()))
            }
        }

        /// Mock check for credential existence.
        pub fn credential_exists(target_name: &str) -> bool {
            let credentials = MOCK_CREDENTIALS.lock().unwrap();
            credentials.contains_key(target_name)
        }

        /// Mock store credential.
        #[cfg(feature = "setup")]
        pub fn store_credential(
            target_name: &str,
            username: &str,
            password: &str,
        ) -> Result<(), VaultError> {
            let mut credentials = MOCK_CREDENTIALS.lock().unwrap();
            credentials.insert(
                target_name.to_string(),
                (username.to_string(), password.to_string()),
            );
            Ok(())
        }

        /// Add a mock credential (for testing only).
        #[cfg(any(test, feature = "mock-mode"))]
        pub fn add_mock_credential(target_name: &str, username: &str, password: &str) {
            let mut credentials = MOCK_CREDENTIALS.lock().unwrap();
            credentials.insert(
                target_name.to_string(),
                (username.to_string(), password.to_string()),
            );
        }
    }
}

/// Mock mode implementation that works on Windows too
#[cfg(all(windows, feature = "mock-mode"))]
impl CredentialVault {
    /// Get mock credential when in mock mode on Windows
    pub fn get_mock_credential(target_name: &str) -> Result<Credential, VaultError> {
        // Return mock credentials for testing
        match target_name {
            "DeploymentWorker:API" => Ok(Credential::new(
                "api-user".to_string(),
                "api-token-12345".to_string(),
            )),
            "DeploymentWorker:SMB" | "DeploymentWorker:Mock" => Ok(Credential::new(
                "DOMAIN\\admin".to_string(),
                "mock-password".to_string(),
            )),
            _ if target_name.starts_with("DeploymentWorker:") => Ok(Credential::new(
                "mock-user".to_string(),
                "mock-password".to_string(),
            )),
            _ => Err(VaultError::NotFound(target_name.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_zeroize() {
        // Create a credential
        let cred = Credential::new("user".to_string(), "password".to_string());
        assert_eq!(cred.username, "user");
        assert_eq!(cred.password, "password");
        // When dropped, memory should be zeroed (can't easily verify, but compile check is enough)
    }

    #[cfg(not(windows))]
    #[test]
    fn test_mock_credential_retrieval() {
        let cred = CredentialVault::get_credential("DeploymentWorker:API").unwrap();
        assert_eq!(cred.username, "api-user");
        assert!(!cred.password.is_empty());
    }

    #[cfg(not(windows))]
    #[test]
    fn test_mock_credential_not_found() {
        let result = CredentialVault::get_credential("NonExistent:Credential");
        assert!(matches!(result, Err(VaultError::NotFound(_))));
    }

    #[cfg(not(windows))]
    #[test]
    fn test_credential_exists() {
        assert!(CredentialVault::credential_exists("DeploymentWorker:API"));
        assert!(!CredentialVault::credential_exists("NonExistent:Credential"));
    }
}
