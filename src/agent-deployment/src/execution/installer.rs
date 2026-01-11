//! MSI installer command building and validation.
//!
//! Provides utilities for building msiexec commands with proper arguments
//! and handling different installation scenarios.

use thiserror::Error;
use tracing::{debug, info};

use crate::api::types::JobType;

/// Errors from installer operations
#[derive(Debug, Error)]
pub enum InstallerError {
    #[error("Invalid MSI path: {0}")]
    InvalidPath(String),

    #[error("Unsupported job type: {0:?}")]
    UnsupportedJobType(JobType),

    #[error("Missing required parameter: {0}")]
    MissingParameter(String),

    #[error("Invalid product code format: {0}")]
    InvalidProductCode(String),
}

/// MSI exit codes and their meanings
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MsiExitCode {
    /// Installation completed successfully (0)
    Success,
    /// Reboot required to complete installation (3010)
    RebootRequired,
    /// Installation already in progress (1618)
    AlreadyInProgress,
    /// Invalid command line argument (1639)
    InvalidArgument,
    /// Installation source unavailable (1612)
    SourceUnavailable,
    /// Product not installed (for uninstall) (1605)
    ProductNotInstalled,
    /// General failure
    Failed(i32),
}

impl From<i32> for MsiExitCode {
    fn from(code: i32) -> Self {
        match code {
            0 => MsiExitCode::Success,
            3010 => MsiExitCode::RebootRequired,
            1618 => MsiExitCode::AlreadyInProgress,
            1639 => MsiExitCode::InvalidArgument,
            1612 => MsiExitCode::SourceUnavailable,
            1605 => MsiExitCode::ProductNotInstalled,
            other => MsiExitCode::Failed(other),
        }
    }
}

impl MsiExitCode {
    /// Check if this exit code represents a successful installation.
    ///
    /// Both 0 (success) and 3010 (reboot required) are considered successful.
    pub fn is_success(&self) -> bool {
        matches!(self, MsiExitCode::Success | MsiExitCode::RebootRequired)
    }

    /// Get the raw exit code value.
    pub fn code(&self) -> i32 {
        match self {
            MsiExitCode::Success => 0,
            MsiExitCode::RebootRequired => 3010,
            MsiExitCode::AlreadyInProgress => 1618,
            MsiExitCode::InvalidArgument => 1639,
            MsiExitCode::SourceUnavailable => 1612,
            MsiExitCode::ProductNotInstalled => 1605,
            MsiExitCode::Failed(code) => *code,
        }
    }

    /// Get a human-readable description.
    pub fn description(&self) -> &'static str {
        match self {
            MsiExitCode::Success => "Installation completed successfully",
            MsiExitCode::RebootRequired => "Installation requires reboot",
            MsiExitCode::AlreadyInProgress => "Another installation is in progress",
            MsiExitCode::InvalidArgument => "Invalid command line argument",
            MsiExitCode::SourceUnavailable => "Installation source unavailable",
            MsiExitCode::ProductNotInstalled => "Product is not installed",
            MsiExitCode::Failed(_) => "Installation failed",
        }
    }
}

/// Builder for msiexec commands
pub struct MsiCommandBuilder {
    /// Path to the MSI file
    msi_path: String,
    /// Installation type (install/uninstall)
    job_type: JobType,
    /// Additional arguments
    install_args: Vec<String>,
    /// Properties to set (KEY=VALUE)
    properties: Vec<(String, String)>,
    /// Quiet mode (no UI)
    quiet: bool,
    /// No restart
    no_restart: bool,
    /// Logging options
    log_file: Option<String>,
}

impl MsiCommandBuilder {
    /// Create a new MSI command builder for installation.
    ///
    /// # Arguments
    /// * `msi_path` - Path to the MSI file (local or UNC)
    /// * `job_type` - Type of job (install/uninstall)
    pub fn new(msi_path: &str, job_type: JobType) -> Self {
        Self {
            msi_path: msi_path.to_string(),
            job_type,
            install_args: Vec::new(),
            properties: Vec::new(),
            quiet: true,
            no_restart: true,
            log_file: None,
        }
    }

    /// Add installation arguments (e.g., "/norestart").
    pub fn with_args(mut self, args: &str) -> Self {
        if !args.is_empty() {
            // Split by whitespace and add each arg
            for arg in args.split_whitespace() {
                self.install_args.push(arg.to_string());
            }
        }
        self
    }

    /// Add a property value (e.g., ENROLL_TOKEN=xxx).
    pub fn with_property(mut self, key: &str, value: &str) -> Self {
        self.properties.push((key.to_string(), value.to_string()));
        self
    }

    /// Set quiet mode (default: true).
    pub fn quiet(mut self, quiet: bool) -> Self {
        self.quiet = quiet;
        self
    }

    /// Set no-restart option (default: true).
    pub fn no_restart(mut self, no_restart: bool) -> Self {
        self.no_restart = no_restart;
        self
    }

    /// Enable logging to a file.
    pub fn with_logging(mut self, log_file: &str) -> Self {
        self.log_file = Some(log_file.to_string());
        self
    }

    /// Build the msiexec command line.
    ///
    /// # Returns
    /// The complete command line string ready for execution.
    pub fn build(self) -> Result<String, InstallerError> {
        let mut cmd = String::from("msiexec");

        // Add operation type
        match self.job_type {
            JobType::MsiInstall => {
                cmd.push_str(" /i");
            }
            JobType::MsiUninstall => {
                cmd.push_str(" /x");
            }
            JobType::Execute => {
                return Err(InstallerError::UnsupportedJobType(self.job_type));
            }
        }

        // Add MSI path (quoted for paths with spaces)
        cmd.push_str(&format!(" \"{}\"", self.msi_path));

        // Add quiet mode
        if self.quiet {
            cmd.push_str(" /qn");
        }

        // Add no-restart option
        if self.no_restart {
            cmd.push_str(" /norestart");
        }

        // Add logging if enabled
        if let Some(log_file) = &self.log_file {
            cmd.push_str(&format!(" /l*v \"{}\"", log_file));
        }

        // Add custom arguments
        for arg in &self.install_args {
            cmd.push_str(&format!(" {}", arg));
        }

        // Add properties
        for (key, value) in &self.properties {
            // Quote values with spaces
            if value.contains(' ') {
                cmd.push_str(&format!(" {}=\"{}\"", key, value));
            } else {
                cmd.push_str(&format!(" {}={}", key, value));
            }
        }

        debug!(command = %cmd, "Built MSI command");
        Ok(cmd)
    }
}

/// Build an MSI install command.
///
/// # Arguments
/// * `msi_path` - Path to the MSI file (local or UNC)
/// * `install_args` - Optional additional arguments
/// * `enroll_token` - Optional enrollment token
///
/// # Returns
/// The complete msiexec command line.
pub fn build_msi_install_command(
    msi_path: &str,
    install_args: Option<&str>,
    enroll_token: Option<&str>,
) -> Result<String, InstallerError> {
    let mut builder = MsiCommandBuilder::new(msi_path, JobType::MsiInstall);

    if let Some(args) = install_args {
        builder = builder.with_args(args);
    }

    if let Some(token) = enroll_token {
        builder = builder.with_property("ENROLL_TOKEN", token);
    }

    builder.build()
}

/// Build an MSI uninstall command.
///
/// # Arguments
/// * `product_code` - MSI product code (GUID) or path to MSI
/// * `install_args` - Optional additional arguments
///
/// # Returns
/// The complete msiexec command line.
pub fn build_msi_uninstall_command(
    product_code: &str,
    install_args: Option<&str>,
) -> Result<String, InstallerError> {
    // Validate product code format if it looks like a GUID
    if product_code.starts_with('{') && !is_valid_product_code(product_code) {
        return Err(InstallerError::InvalidProductCode(product_code.to_string()));
    }

    let mut builder = MsiCommandBuilder::new(product_code, JobType::MsiUninstall);

    if let Some(args) = install_args {
        builder = builder.with_args(args);
    }

    builder.build()
}

/// Validate a product code (GUID) format.
fn is_valid_product_code(code: &str) -> bool {
    // Simple validation: {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
    if !code.starts_with('{') || !code.ends_with('}') {
        return false;
    }

    let inner = &code[1..code.len() - 1];
    let parts: Vec<&str> = inner.split('-').collect();

    if parts.len() != 5 {
        return false;
    }

    // Check each part has correct length and is hex
    let expected_lengths = [8, 4, 4, 4, 12];
    for (part, expected_len) in parts.iter().zip(expected_lengths.iter()) {
        if part.len() != *expected_len || !part.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
    }

    true
}

/// Build a command for executing via remote service.
///
/// This wraps the MSI command in cmd.exe for execution via Windows service.
///
/// # Arguments
/// * `msi_command` - The msiexec command line
///
/// # Returns
/// A command suitable for Windows service execution.
pub fn wrap_for_service_execution(msi_command: &str) -> String {
    format!("cmd.exe /c {}", msi_command)
}

/// Get the remote log file path for an installation.
///
/// # Arguments
/// * `target_hostname` - Target machine hostname
/// * `msi_filename` - Name of the MSI file
///
/// # Returns
/// UNC path to the log file.
pub fn get_remote_log_path(target_hostname: &str, msi_filename: &str) -> String {
    let log_name = msi_filename.replace(".msi", ".log");
    format!("\\\\{}\\ADMIN$\\Temp\\{}", target_hostname, log_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_msi_install_command() {
        let cmd = build_msi_install_command(
            "C:\\Windows\\Temp\\installer.msi",
            Some("/norestart"),
            Some("token123"),
        )
        .unwrap();

        assert!(cmd.contains("msiexec /i"));
        assert!(cmd.contains("installer.msi"));
        assert!(cmd.contains("/qn"));
        assert!(cmd.contains("/norestart"));
        assert!(cmd.contains("ENROLL_TOKEN=token123"));
    }

    #[test]
    fn test_build_msi_uninstall_command() {
        let cmd = build_msi_uninstall_command(
            "{12345678-1234-1234-1234-123456789012}",
            None,
        )
        .unwrap();

        assert!(cmd.contains("msiexec /x"));
        assert!(cmd.contains("{12345678-1234-1234-1234-123456789012}"));
        assert!(cmd.contains("/qn"));
    }

    #[test]
    fn test_invalid_product_code() {
        let result = build_msi_uninstall_command("{invalid-guid}", None);
        assert!(matches!(result, Err(InstallerError::InvalidProductCode(_))));
    }

    #[test]
    fn test_msi_exit_codes() {
        assert!(MsiExitCode::from(0).is_success());
        assert!(MsiExitCode::from(3010).is_success());
        assert!(!MsiExitCode::from(1618).is_success());
        assert!(!MsiExitCode::from(1).is_success());
    }

    #[test]
    fn test_wrap_for_service_execution() {
        let cmd = wrap_for_service_execution("msiexec /i test.msi /qn");
        assert_eq!(cmd, "cmd.exe /c msiexec /i test.msi /qn");
    }

    #[test]
    fn test_valid_product_code() {
        assert!(is_valid_product_code("{12345678-1234-1234-1234-123456789012}"));
        assert!(is_valid_product_code("{ABCDEF01-2345-6789-ABCD-EF0123456789}"));
        assert!(!is_valid_product_code("not-a-guid"));
        assert!(!is_valid_product_code("{12345678-1234-1234-123456789012}")); // Missing section
    }

    #[test]
    fn test_msi_command_builder() {
        let cmd = MsiCommandBuilder::new("C:\\installer.msi", JobType::MsiInstall)
            .with_args("/norestart")
            .with_property("KEY1", "value1")
            .with_property("KEY2", "value with space")
            .with_logging("C:\\install.log")
            .build()
            .unwrap();

        assert!(cmd.contains("msiexec /i"));
        assert!(cmd.contains("/qn"));
        assert!(cmd.contains("/norestart"));
        assert!(cmd.contains("KEY1=value1"));
        assert!(cmd.contains("KEY2=\"value with space\""));
        assert!(cmd.contains("/l*v"));
    }
}
