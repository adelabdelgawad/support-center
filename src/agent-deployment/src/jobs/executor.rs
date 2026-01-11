//! Job execution orchestrator.
//!
//! Handles the execution of deployment jobs across multiple targets,
//! including credential resolution, SMB copy, and MSI installation.

use std::time::{Duration, Instant};

use chrono::Utc;
use thiserror::Error;
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

use crate::api::types::{
    DeploymentJob, DeploymentTarget, ExecutionPhase, InlineCredentials, JobPayload, JobResult,
    JobStatus, JobType, TargetResult,
};
use crate::audit::{audit_event, AuditEvent, AuditEventType};
use crate::config::WorkerConfig;
use crate::credentials::{Credential, CredentialVault, VaultError};
use crate::execution::{
    installer::{build_msi_install_command, build_msi_uninstall_command, wrap_for_service_execution, MsiExitCode},
    service::{check_reachability, execute_msi_via_service},
    smb::{copy_file, delete_file},
};

/// Errors from job execution
#[derive(Debug, Error)]
pub enum ExecutionError {
    #[error("Unsupported job type: {0:?}")]
    UnsupportedJobType(JobType),

    #[error("Credential error: {0}")]
    CredentialError(#[from] VaultError),

    #[error("Target unreachable: {0}")]
    TargetUnreachable(String),

    #[error("SMB error: {0}")]
    SmbError(String),

    #[error("Service execution error: {0}")]
    ServiceError(String),

    #[error("Installer error: {0}")]
    InstallerError(String),

    #[error("Timeout during {phase}")]
    Timeout { phase: String },

    #[error("All targets failed")]
    AllTargetsFailed,
}

/// Job executor responsible for running deployment jobs.
pub struct JobExecutor {
    config: WorkerConfig,
    worker_id: String,
}

impl JobExecutor {
    /// Create a new job executor.
    ///
    /// # Arguments
    /// * `config` - Worker configuration
    /// * `worker_id` - Unique worker identifier
    pub fn new(config: WorkerConfig, worker_id: String) -> Self {
        Self { config, worker_id }
    }

    /// Execute a deployment job.
    ///
    /// This is the main entry point for job execution. It:
    /// 1. Validates the job type
    /// 2. Executes on each target sequentially
    /// 3. Collects results
    /// 4. Returns a complete JobResult
    ///
    /// # Arguments
    /// * `job` - The deployment job to execute
    ///
    /// # Returns
    /// A JobResult with outcomes for each target.
    #[instrument(skip(self, job), fields(job_id = %job.id, job_type = ?job.job_type))]
    pub async fn execute(&self, job: DeploymentJob) -> JobResult {
        let started_at = Utc::now();
        let mut result = JobResult::new(job.id, self.worker_id.clone(), started_at);

        info!(
            targets = job.payload.targets.len(),
            "Starting job execution"
        );

        // Audit: Job started
        audit_event(
            AuditEvent::new(AuditEventType::JobStarted, "started", "Job execution started")
                .with_job_id(job.id)
                .with_worker_id(&self.worker_id),
        );

        // Validate job type
        if !job.job_type.is_supported() {
            result.error_message = Some(format!("Unsupported job type: {:?}", job.job_type));
            result.status = JobStatus::Failed;
            result.finalize();

            audit_event(
                AuditEvent::new(
                    AuditEventType::Error,
                    "failed",
                    &format!("Unsupported job type: {:?}", job.job_type),
                )
                .with_job_id(job.id),
            );

            return result;
        }

        // Execute on each target sequentially
        for target in &job.payload.targets {
            let target_result = self.execute_on_target(&job, target).await;

            // Audit: Target completed
            audit_event(
                AuditEvent::new(
                    AuditEventType::InstallCompleted,
                    if target_result.success { "success" } else { "failed" },
                    target_result
                        .error_message
                        .as_deref()
                        .unwrap_or("Installation completed"),
                )
                .with_job_id(job.id)
                .with_target(&target.hostname),
            );

            result.target_results.push(target_result);
        }

        // Finalize result
        result.finalize();

        // Audit: Job completed
        audit_event(
            AuditEvent::new(
                AuditEventType::JobCompleted,
                &format!("{:?}", result.status),
                &format!("Duration: {}s", result.duration_seconds),
            )
            .with_job_id(job.id)
            .with_worker_id(&self.worker_id),
        );

        info!(
            status = ?result.status,
            duration_secs = result.duration_seconds,
            success_count = result.target_results.iter().filter(|r| r.success).count(),
            total_targets = result.target_results.len(),
            "Job execution completed"
        );

        result
    }

    /// Execute the job on a single target.
    #[instrument(skip(self, job), fields(target = %target.hostname))]
    async fn execute_on_target(&self, job: &DeploymentJob, target: &DeploymentTarget) -> TargetResult {
        let start = Instant::now();
        let hostname = &target.hostname;
        let machine_id = target.machine_id.clone();

        info!("Starting execution on target");

        // Step 1: Reachability check
        debug!("Checking target reachability");
        if let Err(e) = check_reachability(
            hostname,
            Duration::from_secs(self.config.reachability_timeout_seconds),
        )
        .await
        {
            return TargetResult::failure(
                hostname.clone(),
                machine_id,
                format!("Target unreachable: {}", e),
                start.elapsed().as_secs(),
                ExecutionPhase::ReachabilityCheck,
            );
        }

        // Audit: Target connected
        audit_event(
            AuditEvent::new(AuditEventType::TargetConnected, "connected", "Target is reachable")
                .with_job_id(job.id)
                .with_target(hostname),
        );

        // Step 2: Resolve credentials
        debug!("Resolving credentials");
        let vault_ref = target
            .vault_ref
            .as_ref()
            .unwrap_or(&job.payload.vault_ref);

        let credentials = match self.resolve_credentials(vault_ref, job.payload.inline_credentials.as_ref()) {
            Ok(cred) => cred,
            Err(e) => {
                return TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    format!("Credential error: {}", e),
                    start.elapsed().as_secs(),
                    ExecutionPhase::CredentialResolution,
                );
            }
        };

        // Step 3: Execute based on job type
        match job.job_type {
            JobType::MsiInstall => {
                self.execute_msi_install(job, target, &credentials, start).await
            }
            JobType::MsiUninstall => {
                self.execute_msi_uninstall(job, target, &credentials, start).await
            }
            JobType::Execute => {
                // Direct execution not yet implemented
                TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    "Direct execution not implemented".to_string(),
                    start.elapsed().as_secs(),
                    ExecutionPhase::ServiceExecution,
                )
            }
        }
    }

    /// Execute an MSI installation on a target.
    async fn execute_msi_install(
        &self,
        job: &DeploymentJob,
        target: &DeploymentTarget,
        credentials: &Credential,
        start: Instant,
    ) -> TargetResult {
        let hostname = &target.hostname;
        let machine_id = target.machine_id.clone();
        let payload = &job.payload;

        // Step 3a: Copy MSI to target
        debug!("Copying MSI to target");
        let remote_share = format!("\\\\{}\\ADMIN$\\Temp", hostname);

        let remote_msi_path = match copy_file(
            &payload.installer_path,
            &remote_share,
            credentials,
            Duration::from_secs(self.config.smb_copy_timeout_seconds),
        )
        .await
        {
            Ok(path) => {
                audit_event(
                    AuditEvent::new(AuditEventType::FileCopied, "success", "MSI copied to target")
                        .with_job_id(job.id)
                        .with_target(hostname),
                );
                path
            }
            Err(e) => {
                return TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    format!("SMB copy failed: {}", e),
                    start.elapsed().as_secs(),
                    ExecutionPhase::SmbCopy,
                );
            }
        };

        // Convert UNC path to local path for remote machine
        // \\target\ADMIN$\Temp\file.msi -> C:\Windows\Temp\file.msi
        let local_msi_path = remote_msi_path
            .replace(&format!("\\\\{}\\ADMIN$", hostname), "C:\\Windows")
            .replace(&format!("\\\\{}\\admin$", hostname), "C:\\Windows");

        // Step 3b: Build MSI command
        let msi_command = match build_msi_install_command(
            &local_msi_path,
            payload.install_args.as_deref(),
            payload.enroll_token.as_deref(),
        ) {
            Ok(cmd) => cmd,
            Err(e) => {
                // Cleanup copied file
                let _ = delete_file(&remote_msi_path, credentials).await;
                return TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    format!("Failed to build MSI command: {}", e),
                    start.elapsed().as_secs(),
                    ExecutionPhase::ServiceCreation,
                );
            }
        };

        let service_command = wrap_for_service_execution(&msi_command);

        // Step 3c: Execute via service
        debug!(command = %service_command, "Executing MSI via service");

        audit_event(
            AuditEvent::new(AuditEventType::InstallStarted, "started", "MSI installation started")
                .with_job_id(job.id)
                .with_target(hostname),
        );

        let execution_result = execute_msi_via_service(
            hostname,
            &service_command,
            credentials,
            Duration::from_secs(self.config.service_execution_timeout_seconds),
        )
        .await;

        // Step 3d: Cleanup (always run)
        debug!("Cleaning up remote files");
        if let Err(e) = delete_file(&remote_msi_path, credentials).await {
            warn!(error = %e, "Failed to cleanup MSI file");
        }

        audit_event(
            AuditEvent::new(AuditEventType::CleanupCompleted, "completed", "Cleanup finished")
                .with_job_id(job.id)
                .with_target(hostname),
        );

        // Process result
        match execution_result {
            Ok(result) => {
                let exit_code = MsiExitCode::from(result.exit_code);
                TargetResult::success(
                    hostname.clone(),
                    machine_id,
                    result.exit_code,
                    start.elapsed().as_secs(),
                )
            }
            Err(e) => {
                TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    format!("Service execution failed: {}", e),
                    start.elapsed().as_secs(),
                    ExecutionPhase::ServiceExecution,
                )
            }
        }
    }

    /// Execute an MSI uninstall on a target.
    async fn execute_msi_uninstall(
        &self,
        job: &DeploymentJob,
        target: &DeploymentTarget,
        credentials: &Credential,
        start: Instant,
    ) -> TargetResult {
        let hostname = &target.hostname;
        let machine_id = target.machine_id.clone();
        let payload = &job.payload;

        // Get product code
        let product_code = match &payload.product_code {
            Some(code) => code.clone(),
            None => {
                return TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    "Product code required for uninstall".to_string(),
                    start.elapsed().as_secs(),
                    ExecutionPhase::ServiceCreation,
                );
            }
        };

        // Build uninstall command
        let msi_command = match build_msi_uninstall_command(
            &product_code,
            payload.install_args.as_deref(),
        ) {
            Ok(cmd) => cmd,
            Err(e) => {
                return TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    format!("Failed to build uninstall command: {}", e),
                    start.elapsed().as_secs(),
                    ExecutionPhase::ServiceCreation,
                );
            }
        };

        let service_command = wrap_for_service_execution(&msi_command);

        // Execute via service
        debug!(command = %service_command, "Executing uninstall via service");

        let execution_result = execute_msi_via_service(
            hostname,
            &service_command,
            credentials,
            Duration::from_secs(self.config.service_execution_timeout_seconds),
        )
        .await;

        match execution_result {
            Ok(result) => {
                TargetResult::success(
                    hostname.clone(),
                    machine_id,
                    result.exit_code,
                    start.elapsed().as_secs(),
                )
            }
            Err(e) => {
                TargetResult::failure(
                    hostname.clone(),
                    machine_id,
                    format!("Uninstall failed: {}", e),
                    start.elapsed().as_secs(),
                    ExecutionPhase::ServiceExecution,
                )
            }
        }
    }

    /// Resolve credentials from vault or inline credentials.
    ///
    /// If vault_ref is "__inline__", uses the inline credentials from the job payload.
    /// Otherwise, looks up credentials in Windows Credential Manager.
    fn resolve_credentials(
        &self,
        vault_ref: &str,
        inline_credentials: Option<&InlineCredentials>,
    ) -> Result<Credential, VaultError> {
        // Check for inline credentials marker
        if vault_ref == "__inline__" {
            match inline_credentials {
                Some(inline) => {
                    debug!("Using inline credentials for user: {}", inline.username);
                    return Ok(Credential::new(
                        inline.username.clone(),
                        inline.password.clone(),
                    ));
                }
                None => {
                    return Err(VaultError::NotFound(
                        "Inline credentials marker set but no credentials provided".to_string(),
                    ));
                }
            }
        }

        // Fall back to vault lookup
        #[cfg(all(windows, feature = "mock-mode"))]
        {
            return CredentialVault::get_mock_credential(vault_ref);
        }

        #[cfg(not(all(windows, feature = "mock-mode")))]
        {
            CredentialVault::get_credential(vault_ref)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config() -> WorkerConfig {
        WorkerConfig {
            worker_id: Some("test-worker".to_string()),
            poll_interval_seconds: 10,
            max_backoff_seconds: 60,
            max_concurrent_jobs: 1,
            cleanup_timeout_seconds: 30,
            smb_copy_timeout_seconds: 60,
            service_execution_timeout_seconds: 300,
            reachability_timeout_seconds: 5,
        }
    }

    #[test]
    fn test_executor_creation() {
        let config = create_test_config();
        let executor = JobExecutor::new(config, "test-worker".to_string());
        assert_eq!(executor.worker_id, "test-worker");
    }
}
