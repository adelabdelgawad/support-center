//! Structured audit logging for the deployment worker.
//!
//! Provides:
//! - Console logging for development
//! - JSON file logging with rotation for production
//! - Structured audit events for security and compliance

use thiserror::Error;
use tracing::Level;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Layer,
};
use uuid::Uuid;

use crate::config::LoggingConfig;

/// Errors from logging operations
#[derive(Debug, Error)]
pub enum LogError {
    #[error("Failed to create log directory: {0}")]
    DirectoryCreation(std::io::Error),

    #[error("Failed to initialize logging: {0}")]
    Initialization(String),
}

/// Initialize the logging system.
///
/// Sets up both console and file logging based on configuration.
/// File logs are rotated daily and written in JSON format for easy parsing.
///
/// # Arguments
/// * `config` - Logging configuration
///
/// # Example
/// ```ignore
/// let config = LoggingConfig::default();
/// init_logging(&config)?;
/// tracing::info!("Logging initialized");
/// ```
pub fn init_logging(config: &LoggingConfig) -> Result<(), LogError> {
    // Build env filter with default level
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(config.level.clone()));

    // Console layer - human-readable format
    let console_layer = fmt::layer()
        .with_target(true)
        .with_level(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_span_events(FmtSpan::CLOSE)
        .with_ansi(true);

    // File layer - JSON format for structured logs
    let file_layer = if let Some(ref path) = config.file_path {
        // Ensure log directory exists
        std::fs::create_dir_all(path).map_err(LogError::DirectoryCreation)?;

        // Create rolling file appender (daily rotation)
        let file_appender = RollingFileAppender::new(
            Rotation::DAILY,
            path,
            "deployment-worker.log",
        );

        if config.json_format {
            Some(
                fmt::layer()
                    .json()
                    .with_writer(file_appender)
                    .with_target(true)
                    .with_level(true)
                    .with_thread_ids(true)
                    .with_span_events(FmtSpan::CLOSE)
                    .with_current_span(true)
                    .boxed(),
            )
        } else {
            Some(
                fmt::layer()
                    .with_writer(file_appender)
                    .with_target(true)
                    .with_level(true)
                    .with_ansi(false)
                    .boxed(),
            )
        }
    } else {
        None
    };

    // Initialize subscriber
    let subscriber = tracing_subscriber::registry()
        .with(env_filter)
        .with(console_layer);

    if let Some(file_layer) = file_layer {
        subscriber.with(file_layer).try_init()
            .map_err(|e: tracing_subscriber::util::TryInitError| {
                LogError::Initialization(e.to_string())
            })?;
    } else {
        subscriber.try_init()
            .map_err(|e: tracing_subscriber::util::TryInitError| {
                LogError::Initialization(e.to_string())
            })?;
    }

    Ok(())
}

/// Audit event types for structured logging
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditEventType {
    /// Worker started
    WorkerStarted,
    /// Worker stopped
    WorkerStopped,
    /// Job received from backend
    JobReceived,
    /// Job execution started
    JobStarted,
    /// Successfully connected to target
    TargetConnected,
    /// File copied via SMB
    FileCopied,
    /// Installation started on target
    InstallStarted,
    /// Installation completed on target
    InstallCompleted,
    /// Cleanup completed
    CleanupCompleted,
    /// Job completed (all targets)
    JobCompleted,
    /// Error occurred
    Error,
    /// Security event (credential access, etc.)
    Security,
}

impl std::fmt::Display for AuditEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuditEventType::WorkerStarted => write!(f, "WORKER_STARTED"),
            AuditEventType::WorkerStopped => write!(f, "WORKER_STOPPED"),
            AuditEventType::JobReceived => write!(f, "JOB_RECEIVED"),
            AuditEventType::JobStarted => write!(f, "JOB_STARTED"),
            AuditEventType::TargetConnected => write!(f, "TARGET_CONNECTED"),
            AuditEventType::FileCopied => write!(f, "FILE_COPIED"),
            AuditEventType::InstallStarted => write!(f, "INSTALL_STARTED"),
            AuditEventType::InstallCompleted => write!(f, "INSTALL_COMPLETED"),
            AuditEventType::CleanupCompleted => write!(f, "CLEANUP_COMPLETED"),
            AuditEventType::JobCompleted => write!(f, "JOB_COMPLETED"),
            AuditEventType::Error => write!(f, "ERROR"),
            AuditEventType::Security => write!(f, "SECURITY"),
        }
    }
}

/// Structured audit event
#[derive(Debug, Clone)]
pub struct AuditEvent {
    /// Type of event
    pub event_type: AuditEventType,
    /// Related job ID (if any)
    pub job_id: Option<Uuid>,
    /// Target hostname (if applicable)
    pub target: Option<String>,
    /// Status or result
    pub status: String,
    /// Additional details
    pub details: String,
    /// Worker ID
    pub worker_id: Option<String>,
}

impl AuditEvent {
    /// Create a new audit event
    pub fn new(event_type: AuditEventType, status: &str, details: &str) -> Self {
        Self {
            event_type,
            job_id: None,
            target: None,
            status: status.to_string(),
            details: details.to_string(),
            worker_id: None,
        }
    }

    /// Set the job ID
    pub fn with_job_id(mut self, job_id: Uuid) -> Self {
        self.job_id = Some(job_id);
        self
    }

    /// Set the target hostname
    pub fn with_target(mut self, target: &str) -> Self {
        self.target = Some(target.to_string());
        self
    }

    /// Set the worker ID
    pub fn with_worker_id(mut self, worker_id: &str) -> Self {
        self.worker_id = Some(worker_id.to_string());
        self
    }
}

/// Log a structured audit event.
///
/// This function emits a tracing event with structured fields that
/// can be parsed by log aggregation systems.
///
/// # Arguments
/// * `event` - The audit event to log
///
/// # Example
/// ```ignore
/// audit_event(AuditEvent::new(
///     AuditEventType::JobReceived,
///     "pending",
///     "Received MSI install job"
/// ).with_job_id(job_id));
/// ```
pub fn audit_event(event: AuditEvent) {
    // Use tracing macros with structured fields
    match event.event_type {
        AuditEventType::Error | AuditEventType::Security => {
            tracing::warn!(
                event_type = %event.event_type,
                job_id = ?event.job_id,
                target = ?event.target,
                worker_id = ?event.worker_id,
                status = %event.status,
                details = %event.details,
                "AUDIT"
            );
        }
        _ => {
            tracing::info!(
                event_type = %event.event_type,
                job_id = ?event.job_id,
                target = ?event.target,
                worker_id = ?event.worker_id,
                status = %event.status,
                details = %event.details,
                "AUDIT"
            );
        }
    }
}

/// Helper macros for common audit events
#[macro_export]
macro_rules! audit_job_received {
    ($job_id:expr, $job_type:expr) => {
        $crate::audit::audit_event($crate::audit::AuditEvent::new(
            $crate::audit::AuditEventType::JobReceived,
            "received",
            &format!("Job type: {:?}", $job_type),
        ).with_job_id($job_id));
    };
}

#[macro_export]
macro_rules! audit_job_completed {
    ($job_id:expr, $status:expr, $duration_secs:expr) => {
        $crate::audit::audit_event($crate::audit::AuditEvent::new(
            $crate::audit::AuditEventType::JobCompleted,
            &format!("{:?}", $status),
            &format!("Duration: {}s", $duration_secs),
        ).with_job_id($job_id));
    };
}

#[macro_export]
macro_rules! audit_target_install {
    ($job_id:expr, $target:expr, $success:expr, $exit_code:expr) => {
        $crate::audit::audit_event($crate::audit::AuditEvent::new(
            $crate::audit::AuditEventType::InstallCompleted,
            if $success { "success" } else { "failed" },
            &format!("Exit code: {:?}", $exit_code),
        ).with_job_id($job_id).with_target($target));
    };
}

#[macro_export]
macro_rules! audit_error {
    ($job_id:expr, $target:expr, $error:expr) => {
        $crate::audit::audit_event($crate::audit::AuditEvent::new(
            $crate::audit::AuditEventType::Error,
            "error",
            &format!("{}", $error),
        ).with_job_id($job_id).with_target($target));
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audit_event_type_display() {
        assert_eq!(AuditEventType::JobReceived.to_string(), "JOB_RECEIVED");
        assert_eq!(AuditEventType::Error.to_string(), "ERROR");
    }

    #[test]
    fn test_audit_event_builder() {
        let event = AuditEvent::new(AuditEventType::JobStarted, "started", "Test details")
            .with_job_id(Uuid::new_v4())
            .with_target("target-01")
            .with_worker_id("worker-001");

        assert!(event.job_id.is_some());
        assert_eq!(event.target, Some("target-01".to_string()));
        assert_eq!(event.worker_id, Some("worker-001".to_string()));
    }
}
