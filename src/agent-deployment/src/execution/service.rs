//! Remote Windows service control for executing MSI installers.
//!
//! Creates temporary Windows services on remote machines to execute
//! msiexec commands with proper permissions.

use std::time::Duration;

use thiserror::Error;
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

use crate::credentials::Credential;

/// Errors from service operations
#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("Failed to connect to SCM on {host}: {message}")]
    ScmConnectionFailed { host: String, message: String },

    #[error("Failed to create service {name}: {message}")]
    ServiceCreationFailed { name: String, message: String },

    #[error("Failed to start service {name}: {message}")]
    ServiceStartFailed { name: String, message: String },

    #[error("Failed to delete service {name}: {message}")]
    ServiceDeleteFailed { name: String, message: String },

    #[error("Service execution timed out after {seconds}s")]
    Timeout { seconds: u64 },

    #[error("Service exited with error code {code}")]
    ExecutionFailed { code: i32 },

    #[error("Access denied to {resource}")]
    AccessDenied { resource: String },

    #[error("Network error: {0}")]
    NetworkError(String),
}

/// Result of service execution
#[derive(Debug, Clone)]
pub struct ServiceExecutionResult {
    /// Exit code from the command (0 = success)
    pub exit_code: i32,
    /// Duration of execution
    pub duration: Duration,
    /// Whether cleanup was successful
    pub cleanup_success: bool,
}

/// Generate a unique temporary service name.
///
/// Format: DeployWorker_XXXXXXXX where X is a UUID short form.
pub fn generate_temp_service_name() -> String {
    let uuid = Uuid::new_v4();
    format!("DeployWorker_{}", &uuid.simple().to_string()[..8])
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use std::thread;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_ACCESS_DENIED, ERROR_SERVICE_EXISTS,
        HANDLE, WIN32_ERROR,
    };
    use windows::Win32::System::Services::{
        CloseServiceHandle, ControlService, CreateServiceW, DeleteService,
        OpenSCManagerW, OpenServiceW, QueryServiceStatus, StartServiceW,
        SC_HANDLE, SC_MANAGER_ALL_ACCESS, SC_MANAGER_CONNECT,
        SERVICE_ALL_ACCESS, SERVICE_CONTROL_STOP, SERVICE_DEMAND_START,
        SERVICE_ERROR_NORMAL, SERVICE_RUNNING, SERVICE_START_PENDING,
        SERVICE_STATUS, SERVICE_STOPPED, SERVICE_WIN32_OWN_PROCESS,
    };

    /// Convert a Rust string to a null-terminated wide string
    fn to_wide_string(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    /// Remote SCM connection
    struct RemoteScm {
        handle: SC_HANDLE,
        hostname: String,
    }

    impl RemoteScm {
        /// Connect to a remote Service Control Manager.
        fn connect(hostname: &str, _credentials: &Credential) -> Result<Self, ServiceError> {
            let machine_name = if hostname.starts_with("\\\\") {
                hostname.to_string()
            } else {
                format!("\\\\{}", hostname)
            };

            let machine_wide = to_wide_string(&machine_name);

            unsafe {
                let handle = OpenSCManagerW(
                    PCWSTR::from_raw(machine_wide.as_ptr()),
                    PCWSTR::null(),
                    SC_MANAGER_ALL_ACCESS,
                );

                if handle.is_invalid() {
                    let error = GetLastError();
                    let message = if error == ERROR_ACCESS_DENIED {
                        "Access denied - check credentials".to_string()
                    } else {
                        format!("Error code: {:?}", error)
                    };
                    return Err(ServiceError::ScmConnectionFailed {
                        host: hostname.to_string(),
                        message,
                    });
                }

                debug!("Connected to SCM on {}", hostname);
                Ok(Self {
                    handle,
                    hostname: hostname.to_string(),
                })
            }
        }

        /// Create a temporary service.
        fn create_service(
            &self,
            service_name: &str,
            binary_path: &str,
        ) -> Result<RemoteService, ServiceError> {
            let name_wide = to_wide_string(service_name);
            let display_wide = to_wide_string(&format!("Deployment Worker - {}", service_name));
            let binary_wide = to_wide_string(binary_path);

            unsafe {
                let handle = CreateServiceW(
                    self.handle,
                    PCWSTR::from_raw(name_wide.as_ptr()),
                    PCWSTR::from_raw(display_wide.as_ptr()),
                    SERVICE_ALL_ACCESS,
                    SERVICE_WIN32_OWN_PROCESS,
                    SERVICE_DEMAND_START,
                    SERVICE_ERROR_NORMAL,
                    PCWSTR::from_raw(binary_wide.as_ptr()),
                    PCWSTR::null(),
                    ptr::null_mut(),
                    PCWSTR::null(),
                    PCWSTR::null(),
                    PCWSTR::null(),
                );

                if handle.is_invalid() {
                    let error = GetLastError();
                    let message = if error == ERROR_SERVICE_EXISTS {
                        "Service already exists".to_string()
                    } else if error == ERROR_ACCESS_DENIED {
                        "Access denied".to_string()
                    } else {
                        format!("Error code: {:?}", error)
                    };
                    return Err(ServiceError::ServiceCreationFailed {
                        name: service_name.to_string(),
                        message,
                    });
                }

                debug!("Created service {} on {}", service_name, self.hostname);
                Ok(RemoteService {
                    handle,
                    name: service_name.to_string(),
                })
            }
        }
    }

    impl Drop for RemoteScm {
        fn drop(&mut self) {
            unsafe {
                CloseServiceHandle(self.handle);
            }
        }
    }

    /// Handle to a remote service
    struct RemoteService {
        handle: SC_HANDLE,
        name: String,
    }

    impl RemoteService {
        /// Start the service.
        fn start(&self) -> Result<(), ServiceError> {
            unsafe {
                let result = StartServiceW(self.handle, None);

                if result.is_err() {
                    let error = GetLastError();
                    return Err(ServiceError::ServiceStartFailed {
                        name: self.name.clone(),
                        message: format!("Error code: {:?}", error),
                    });
                }

                debug!("Started service {}", self.name);
                Ok(())
            }
        }

        /// Query service status.
        fn query_status(&self) -> Result<u32, ServiceError> {
            unsafe {
                let mut status = SERVICE_STATUS::default();
                let result = QueryServiceStatus(self.handle, &mut status);

                if result.is_err() {
                    let error = GetLastError();
                    return Err(ServiceError::NetworkError(format!(
                        "Failed to query status: {:?}",
                        error
                    )));
                }

                Ok(status.dwCurrentState.0)
            }
        }

        /// Wait for service to stop with timeout.
        fn wait_for_stop(&self, timeout: Duration) -> Result<i32, ServiceError> {
            let start = std::time::Instant::now();
            let poll_interval = Duration::from_secs(1);

            loop {
                if start.elapsed() > timeout {
                    return Err(ServiceError::Timeout {
                        seconds: timeout.as_secs(),
                    });
                }

                let state = self.query_status()?;

                if state == SERVICE_STOPPED.0 {
                    // Service has stopped - get exit code from status
                    unsafe {
                        let mut status = SERVICE_STATUS::default();
                        let _ = QueryServiceStatus(self.handle, &mut status);
                        let exit_code = status.dwWin32ExitCode as i32;
                        debug!("Service {} stopped with exit code {}", self.name, exit_code);
                        return Ok(exit_code);
                    }
                }

                if state != SERVICE_RUNNING.0 && state != SERVICE_START_PENDING.0 {
                    // Unexpected state
                    warn!("Service {} in unexpected state: {}", self.name, state);
                }

                thread::sleep(poll_interval);
            }
        }

        /// Delete the service.
        fn delete(&self) -> Result<(), ServiceError> {
            unsafe {
                let result = DeleteService(self.handle);

                if result.is_err() {
                    let error = GetLastError();
                    warn!(
                        "Failed to delete service {}: {:?}",
                        self.name, error
                    );
                    return Err(ServiceError::ServiceDeleteFailed {
                        name: self.name.clone(),
                        message: format!("Error code: {:?}", error),
                    });
                }

                debug!("Deleted service {}", self.name);
                Ok(())
            }
        }
    }

    impl Drop for RemoteService {
        fn drop(&mut self) {
            unsafe {
                CloseServiceHandle(self.handle);
            }
        }
    }

    /// Execute an MSI command via a temporary Windows service.
    ///
    /// This function:
    /// 1. Connects to the remote SCM
    /// 2. Creates a temporary service with the command
    /// 3. Starts the service
    /// 4. Waits for completion
    /// 5. Deletes the service (cleanup)
    ///
    /// # Arguments
    /// * `target_hostname` - Remote machine hostname
    /// * `command` - Command to execute (e.g., "cmd.exe /c msiexec...")
    /// * `credentials` - Credentials for remote access
    /// * `timeout` - Maximum execution time
    ///
    /// # Returns
    /// The exit code from the command.
    #[instrument(skip(credentials), fields(target = %target_hostname))]
    pub fn execute_via_service_internal(
        target_hostname: &str,
        command: &str,
        credentials: &Credential,
        timeout: Duration,
    ) -> Result<ServiceExecutionResult, ServiceError> {
        let service_name = generate_temp_service_name();
        let start_time = std::time::Instant::now();
        let mut cleanup_success = true;

        info!(
            service_name = %service_name,
            command = %command,
            "Executing command via remote service"
        );

        // Connect to remote SCM
        let scm = RemoteScm::connect(target_hostname, credentials)?;

        // Create the temporary service
        let service = scm.create_service(&service_name, command)?;

        // Start the service
        service.start()?;

        // Wait for completion
        let exit_code = service.wait_for_stop(timeout)?;

        // Delete the service (cleanup)
        if let Err(e) = service.delete() {
            warn!(error = %e, "Failed to delete temporary service");
            cleanup_success = false;
        }

        let duration = start_time.elapsed();

        Ok(ServiceExecutionResult {
            exit_code,
            duration,
            cleanup_success,
        })
    }
}

#[cfg(not(windows))]
mod mock_impl {
    use super::*;

    /// Mock implementation for non-Windows platforms.
    #[instrument(skip(_credentials), fields(target = %target_hostname))]
    pub fn execute_via_service_internal(
        target_hostname: &str,
        command: &str,
        _credentials: &Credential,
        _timeout: Duration,
    ) -> Result<ServiceExecutionResult, ServiceError> {
        info!(
            "[MOCK] Would execute on {} via service: {}",
            target_hostname, command
        );

        // Simulate execution time
        std::thread::sleep(Duration::from_secs(2));

        Ok(ServiceExecutionResult {
            exit_code: 0,
            duration: Duration::from_secs(2),
            cleanup_success: true,
        })
    }
}

#[cfg(windows)]
use windows_impl::execute_via_service_internal;

#[cfg(not(windows))]
use mock_impl::execute_via_service_internal;

/// Execute an MSI installer via a remote Windows service.
///
/// This is the main entry point for remote MSI execution.
///
/// # Arguments
/// * `target_hostname` - Target machine hostname
/// * `msi_command` - The msiexec command to run
/// * `credentials` - Credentials for remote access
/// * `timeout` - Maximum execution time
///
/// # Returns
/// The result of the service execution.
#[instrument(skip(credentials))]
pub async fn execute_msi_via_service(
    target_hostname: &str,
    msi_command: &str,
    credentials: &Credential,
    timeout: Duration,
) -> Result<ServiceExecutionResult, ServiceError> {
    let host = target_hostname.to_string();
    let cmd = msi_command.to_string();
    let creds = credentials.clone();

    // Run in blocking task since Windows API calls are synchronous
    tokio::task::spawn_blocking(move || {
        execute_via_service_internal(&host, &cmd, &creds, timeout)
    })
    .await
    .map_err(|e| ServiceError::NetworkError(format!("Task failed: {}", e)))?
}

/// Check if a remote machine is reachable via SMB (port 445).
///
/// # Arguments
/// * `hostname` - Target machine hostname
/// * `timeout` - Connection timeout
///
/// # Returns
/// Ok(()) if reachable, Err otherwise.
#[instrument]
pub async fn check_reachability(hostname: &str, timeout: Duration) -> Result<(), ServiceError> {
    use std::net::{SocketAddr, TcpStream, ToSocketAddrs};

    let host = hostname.to_string();

    tokio::task::spawn_blocking(move || {
        // Resolve hostname and try SMB port (445)
        let addr_str = format!("{}:445", host);

        let addrs: Vec<SocketAddr> = addr_str
            .to_socket_addrs()
            .map_err(|e| ServiceError::NetworkError(format!("DNS resolution failed: {}", e)))?
            .collect();

        if addrs.is_empty() {
            return Err(ServiceError::NetworkError("No addresses found".to_string()));
        }

        // Try each resolved address
        for addr in addrs {
            match TcpStream::connect_timeout(&addr, timeout) {
                Ok(_) => {
                    debug!("Target {} is reachable at {}", host, addr);
                    return Ok(());
                }
                Err(e) => {
                    debug!("Connection to {} failed: {}", addr, e);
                }
            }
        }

        Err(ServiceError::NetworkError(format!(
            "Cannot reach {} on port 445",
            host
        )))
    })
    .await
    .map_err(|e| ServiceError::NetworkError(format!("Task failed: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_temp_service_name() {
        let name = generate_temp_service_name();
        assert!(name.starts_with("DeployWorker_"));
        assert!(name.len() > 12);
    }

    #[test]
    fn test_service_error_display() {
        let err = ServiceError::Timeout { seconds: 300 };
        assert!(err.to_string().contains("300"));
    }

    #[tokio::test]
    async fn test_check_reachability_localhost() {
        // This test may fail if port 445 is not open on localhost
        // It's primarily for testing the async wrapper
        let result = check_reachability("127.0.0.1", Duration::from_secs(1)).await;
        // Just verify it doesn't panic - actual result depends on local config
        let _ = result;
    }
}
