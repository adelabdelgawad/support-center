//! Configuration management for the deployment worker.
//!
//! Loads configuration from:
//! 1. Config file: `C:\ProgramData\DeploymentWorker\config.toml` (Windows)
//!    or `/etc/deployment-worker/config.toml` (Linux)
//! 2. Environment variables with `DEPLOYMENT_` prefix

use config::{Config as ConfigLoader, ConfigError, Environment, File};
use serde::Deserialize;
use std::path::PathBuf;

/// Main configuration structure
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub api: ApiConfig,
    pub worker: WorkerConfig,
    pub logging: LoggingConfig,
    #[serde(default)]
    pub mock_mode: bool,
}

/// API connection configuration
#[derive(Debug, Clone, Deserialize)]
pub struct ApiConfig {
    /// Backend base URL (e.g., "https://api.example.com")
    pub base_url: String,
    /// Endpoint for polling jobs (default: "/internal/deployment-jobs/next")
    #[serde(default = "default_poll_endpoint")]
    pub poll_endpoint: String,
    /// Endpoint pattern for reporting results (default: "/internal/deployment-jobs/{id}/result")
    #[serde(default = "default_report_endpoint")]
    pub report_endpoint: String,
    /// HTTP request timeout in seconds (default: 30)
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
    /// Windows Credential Manager target name for API token
    #[serde(default = "default_credential_target")]
    pub credential_target: String,
}

/// Worker behavior configuration
#[derive(Debug, Clone, Deserialize)]
pub struct WorkerConfig {
    /// Unique worker identifier (auto-generated if not set)
    pub worker_id: Option<String>,
    /// Poll interval in seconds (default: 30)
    #[serde(default = "default_poll_interval")]
    pub poll_interval_seconds: u64,
    /// Maximum backoff interval in seconds when no jobs (default: 300)
    #[serde(default = "default_max_backoff")]
    pub max_backoff_seconds: u64,
    /// Maximum concurrent jobs (default: 1 for safety)
    #[serde(default = "default_concurrent_jobs")]
    pub max_concurrent_jobs: u64,
    /// Cleanup timeout in seconds (default: 60)
    #[serde(default = "default_cleanup_timeout")]
    pub cleanup_timeout_seconds: u64,
    /// SMB copy timeout in seconds (default: 300)
    #[serde(default = "default_smb_timeout")]
    pub smb_copy_timeout_seconds: u64,
    /// Service execution timeout in seconds (default: 600)
    #[serde(default = "default_execution_timeout")]
    pub service_execution_timeout_seconds: u64,
    /// Reachability check timeout in seconds (default: 5)
    #[serde(default = "default_reachability_timeout")]
    pub reachability_timeout_seconds: u64,
}

/// Logging configuration
#[derive(Debug, Clone, Deserialize)]
pub struct LoggingConfig {
    /// Log level: trace, debug, info, warn, error (default: "info")
    #[serde(default = "default_log_level")]
    pub level: String,
    /// Log file directory (default: "C:\ProgramData\DeploymentWorker\logs")
    #[serde(default = "default_log_path")]
    pub file_path: Option<String>,
    /// Maximum log file size in MB (default: 10)
    #[serde(default = "default_log_size")]
    pub max_size_mb: u64,
    /// Maximum number of rotated log files (default: 5)
    #[serde(default = "default_log_files")]
    pub max_files: u32,
    /// Enable JSON format for file logs (default: true)
    #[serde(default = "default_json_logs")]
    pub json_format: bool,
}

// Default value functions
fn default_poll_endpoint() -> String {
    "/internal/deployment-jobs/next".to_string()
}

fn default_report_endpoint() -> String {
    "/internal/deployment-jobs/{id}/result".to_string()
}

fn default_timeout() -> u64 {
    30
}

fn default_credential_target() -> String {
    "DeploymentWorker:API".to_string()
}

fn default_poll_interval() -> u64 {
    30
}

fn default_max_backoff() -> u64 {
    300
}

fn default_concurrent_jobs() -> u64 {
    1
}

fn default_cleanup_timeout() -> u64 {
    60
}

fn default_smb_timeout() -> u64 {
    300
}

fn default_execution_timeout() -> u64 {
    600
}

fn default_reachability_timeout() -> u64 {
    5
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_log_path() -> Option<String> {
    #[cfg(windows)]
    {
        Some("C:\\ProgramData\\DeploymentWorker\\logs".to_string())
    }
    #[cfg(not(windows))]
    {
        Some("/var/log/deployment-worker".to_string())
    }
}

fn default_log_size() -> u64 {
    10
}

fn default_log_files() -> u32 {
    5
}

fn default_json_logs() -> bool {
    true
}

impl Config {
    /// Load configuration from file and environment variables.
    ///
    /// Priority (highest to lowest):
    /// 1. Environment variables (DEPLOYMENT_API_BASE_URL, etc.)
    /// 2. Config file
    /// 3. Default values
    pub fn load() -> Result<Self, ConfigError> {
        let config_path = Self::get_config_path();

        let builder = ConfigLoader::builder()
            // Start with defaults
            .set_default("mock_mode", false)?
            .set_default("api.poll_endpoint", default_poll_endpoint())?
            .set_default("api.report_endpoint", default_report_endpoint())?
            .set_default("api.timeout_seconds", default_timeout())?
            .set_default("api.credential_target", default_credential_target())?
            .set_default("worker.poll_interval_seconds", default_poll_interval())?
            .set_default("worker.max_backoff_seconds", default_max_backoff())?
            .set_default("worker.max_concurrent_jobs", default_concurrent_jobs())?
            .set_default("worker.cleanup_timeout_seconds", default_cleanup_timeout())?
            .set_default("worker.smb_copy_timeout_seconds", default_smb_timeout())?
            .set_default("worker.service_execution_timeout_seconds", default_execution_timeout())?
            .set_default("worker.reachability_timeout_seconds", default_reachability_timeout())?
            .set_default("logging.level", default_log_level())?
            .set_default("logging.max_size_mb", default_log_size())?
            .set_default("logging.max_files", default_log_files())?
            .set_default("logging.json_format", default_json_logs())?;

        // Add config file if it exists
        let builder = if config_path.exists() {
            builder.add_source(File::from(config_path))
        } else {
            builder
        };

        // Add environment variables with DEPLOYMENT_ prefix
        // e.g., DEPLOYMENT_API_BASE_URL -> api.base_url
        let builder = builder.add_source(
            Environment::with_prefix("DEPLOYMENT")
                .separator("_")
                .try_parsing(true),
        );

        let config: Config = builder.build()?.try_deserialize()?;

        // Validate required fields
        config.validate()?;

        Ok(config)
    }

    /// Load configuration for testing (mock mode enabled)
    #[cfg(feature = "mock-mode")]
    pub fn load_mock() -> Self {
        Config {
            api: ApiConfig {
                base_url: "http://localhost:8000".to_string(),
                poll_endpoint: default_poll_endpoint(),
                report_endpoint: default_report_endpoint(),
                timeout_seconds: default_timeout(),
                credential_target: "DeploymentWorker:Mock".to_string(),
            },
            worker: WorkerConfig {
                worker_id: Some("mock-worker-001".to_string()),
                poll_interval_seconds: 10,
                max_backoff_seconds: 30,
                max_concurrent_jobs: 1,
                cleanup_timeout_seconds: 10,
                smb_copy_timeout_seconds: 10,
                service_execution_timeout_seconds: 30,
                reachability_timeout_seconds: 2,
            },
            logging: LoggingConfig {
                level: "debug".to_string(),
                file_path: None,
                max_size_mb: 10,
                max_files: 5,
                json_format: false,
            },
            mock_mode: true,
        }
    }

    /// Get the configuration file path
    fn get_config_path() -> PathBuf {
        #[cfg(windows)]
        {
            PathBuf::from("C:\\ProgramData\\DeploymentWorker\\config.toml")
        }
        #[cfg(not(windows))]
        {
            PathBuf::from("/etc/deployment-worker/config.toml")
        }
    }

    /// Validate configuration values
    fn validate(&self) -> Result<(), ConfigError> {
        if self.api.base_url.is_empty() {
            return Err(ConfigError::Message(
                "api.base_url is required".to_string(),
            ));
        }

        if self.worker.poll_interval_seconds == 0 {
            return Err(ConfigError::Message(
                "worker.poll_interval_seconds must be greater than 0".to_string(),
            ));
        }

        if self.worker.max_concurrent_jobs == 0 {
            return Err(ConfigError::Message(
                "worker.max_concurrent_jobs must be greater than 0".to_string(),
            ));
        }

        Ok(())
    }

    /// Generate or get worker ID
    pub fn get_worker_id(&self) -> String {
        self.worker.worker_id.clone().unwrap_or_else(|| {
            // Generate worker ID from hostname and process ID
            let hostname = hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            format!("{}-{}", hostname, std::process::id())
        })
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            api: ApiConfig {
                base_url: String::new(),
                poll_endpoint: default_poll_endpoint(),
                report_endpoint: default_report_endpoint(),
                timeout_seconds: default_timeout(),
                credential_target: default_credential_target(),
            },
            worker: WorkerConfig {
                worker_id: None,
                poll_interval_seconds: default_poll_interval(),
                max_backoff_seconds: default_max_backoff(),
                max_concurrent_jobs: default_concurrent_jobs(),
                cleanup_timeout_seconds: default_cleanup_timeout(),
                smb_copy_timeout_seconds: default_smb_timeout(),
                service_execution_timeout_seconds: default_execution_timeout(),
                reachability_timeout_seconds: default_reachability_timeout(),
            },
            logging: LoggingConfig {
                level: default_log_level(),
                file_path: default_log_path(),
                max_size_mb: default_log_size(),
                max_files: default_log_files(),
                json_format: default_json_logs(),
            },
            mock_mode: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.api.poll_endpoint, "/internal/deployment-jobs/next");
        assert_eq!(config.worker.poll_interval_seconds, 30);
        assert!(!config.mock_mode);
    }

    #[test]
    fn test_worker_id_generation() {
        let config = Config::default();
        let worker_id = config.get_worker_id();
        assert!(!worker_id.is_empty());
    }
}
