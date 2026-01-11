//! API contract types for communication with the Python backend.
//!
//! All types use camelCase for JSON serialization to match the backend's
//! HTTPSchemaModel which automatically converts to camelCase.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Deployment job received from `GET /internal/deployment-jobs/next`
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentJob {
    /// Unique job identifier
    pub id: Uuid,
    /// Type of job to execute
    pub job_type: JobType,
    /// When the job was created
    pub created_at: DateTime<Utc>,
    /// Job priority (lower = higher priority)
    #[serde(default = "default_priority")]
    pub priority: u8,
    /// Job-specific payload
    pub payload: JobPayload,
    /// Worker ID that claimed this job (set by backend)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimed_by: Option<String>,
    /// When the job was claimed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimed_at: Option<DateTime<Utc>>,
}

fn default_priority() -> u8 {
    5
}

/// Supported job types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobType {
    /// Install MSI package
    MsiInstall,
    /// Uninstall MSI package
    MsiUninstall,
    /// Generic executable
    Execute,
}

impl JobType {
    /// Check if this job type is supported by this worker
    pub fn is_supported(&self) -> bool {
        matches!(self, JobType::MsiInstall | JobType::MsiUninstall | JobType::Execute)
    }

    /// Get human-readable name
    pub fn as_str(&self) -> &'static str {
        match self {
            JobType::MsiInstall => "MSI Install",
            JobType::MsiUninstall => "MSI Uninstall",
            JobType::Execute => "Execute",
        }
    }
}

/// Inline credentials for per-task installation (not stored in vault)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineCredentials {
    /// Username (e.g., "DOMAIN\\admin" or "admin@domain.com")
    pub username: String,
    /// Password
    pub password: String,
    /// Credential type: "local_admin" or "domain_admin"
    #[serde(default = "default_credential_type")]
    pub r#type: String,
}

fn default_credential_type() -> String {
    "domain_admin".to_string()
}

/// Job payload containing execution details
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobPayload {
    /// Source path to the installer (SMB path like `\\server\share\installer.msi`)
    pub installer_path: String,
    /// Credential Manager target name for SMB access (use "__inline__" for inline credentials)
    pub vault_ref: String,
    /// Inline credentials (used when vault_ref is "__inline__")
    #[serde(default)]
    pub inline_credentials: Option<InlineCredentials>,
    /// Additional installer arguments (e.g., "/qn /norestart")
    #[serde(default)]
    pub install_args: Option<String>,
    /// Token to pass to installer (e.g., ENROLL_TOKEN for NetSupport)
    #[serde(default)]
    pub enroll_token: Option<String>,
    /// List of target machines to deploy to
    pub targets: Vec<DeploymentTarget>,
    /// Product code for uninstall operations
    #[serde(default)]
    pub product_code: Option<String>,
    /// Whether to force restart after installation
    #[serde(default)]
    pub force_restart: bool,
}

/// Target machine for deployment
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentTarget {
    /// Hostname or IP address of the target machine
    pub hostname: String,
    /// Optional per-target credential override
    #[serde(default)]
    pub vault_ref: Option<String>,
    /// Optional machine identifier (for tracking)
    #[serde(default)]
    pub machine_id: Option<String>,
}

/// Job result to report via `POST /internal/deployment-jobs/{id}/result`
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobResult {
    /// Job ID being reported
    pub job_id: Uuid,
    /// Worker ID that executed the job
    pub worker_id: String,
    /// Overall job status
    pub status: JobStatus,
    /// When execution started
    pub started_at: DateTime<Utc>,
    /// When execution completed
    pub completed_at: DateTime<Utc>,
    /// Total duration in seconds
    pub duration_seconds: u64,
    /// Results for each target
    pub target_results: Vec<TargetResult>,
    /// Overall error message (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

impl JobResult {
    /// Create a new job result
    pub fn new(job_id: Uuid, worker_id: String, started_at: DateTime<Utc>) -> Self {
        Self {
            job_id,
            worker_id,
            status: JobStatus::Success,
            started_at,
            completed_at: Utc::now(),
            duration_seconds: 0,
            target_results: Vec::new(),
            error_message: None,
        }
    }

    /// Finalize the result, calculating status and duration
    pub fn finalize(&mut self) {
        self.completed_at = Utc::now();
        self.duration_seconds = (self.completed_at - self.started_at).num_seconds() as u64;
        self.status = self.calculate_status();
    }

    /// Calculate overall status based on target results
    fn calculate_status(&self) -> JobStatus {
        if self.target_results.is_empty() {
            return JobStatus::Failed;
        }

        let success_count = self.target_results.iter().filter(|r| r.success).count();
        let total = self.target_results.len();

        if success_count == total {
            JobStatus::Success
        } else if success_count > 0 {
            JobStatus::PartialSuccess
        } else {
            JobStatus::Failed
        }
    }
}

/// Overall job status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    /// All targets succeeded
    Success,
    /// Some targets succeeded, some failed
    PartialSuccess,
    /// All targets failed or job-level error
    Failed,
}

/// Result for a single target machine
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetResult {
    /// Target hostname
    pub hostname: String,
    /// Machine ID (if provided)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub machine_id: Option<String>,
    /// Whether the operation succeeded
    pub success: bool,
    /// Exit code from installer (0 = success, 3010 = reboot required)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    /// Duration for this target in seconds
    pub duration_seconds: u64,
    /// Execution phase where failure occurred (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_phase: Option<ExecutionPhase>,
}

impl TargetResult {
    /// Create a successful result
    pub fn success(hostname: String, machine_id: Option<String>, exit_code: i32, duration_seconds: u64) -> Self {
        Self {
            hostname,
            machine_id,
            success: exit_code == 0 || exit_code == 3010, // 3010 = reboot required
            exit_code: Some(exit_code),
            error_message: None,
            duration_seconds,
            failed_phase: None,
        }
    }

    /// Create a failed result
    pub fn failure(
        hostname: String,
        machine_id: Option<String>,
        error: String,
        duration_seconds: u64,
        phase: ExecutionPhase,
    ) -> Self {
        Self {
            hostname,
            machine_id,
            success: false,
            exit_code: None,
            error_message: Some(error),
            duration_seconds,
            failed_phase: Some(phase),
        }
    }
}

/// Execution phases for tracking where failures occur
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionPhase {
    /// Checking if target is reachable
    ReachabilityCheck,
    /// Resolving credentials from vault
    CredentialResolution,
    /// Copying installer via SMB
    SmbCopy,
    /// Creating Windows service
    ServiceCreation,
    /// Starting and monitoring service
    ServiceExecution,
    /// Cleanup operations
    Cleanup,
}

impl std::fmt::Display for ExecutionPhase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecutionPhase::ReachabilityCheck => write!(f, "reachability check"),
            ExecutionPhase::CredentialResolution => write!(f, "credential resolution"),
            ExecutionPhase::SmbCopy => write!(f, "SMB copy"),
            ExecutionPhase::ServiceCreation => write!(f, "service creation"),
            ExecutionPhase::ServiceExecution => write!(f, "service execution"),
            ExecutionPhase::Cleanup => write!(f, "cleanup"),
        }
    }
}

/// Error response from the API
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorResponse {
    pub detail: String,
    #[serde(default)]
    pub error_code: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_job_type_supported() {
        assert!(JobType::MsiInstall.is_supported());
        assert!(JobType::MsiUninstall.is_supported());
        assert!(JobType::Execute.is_supported());
    }

    #[test]
    fn test_job_status_calculation() {
        let mut result = JobResult::new(
            Uuid::new_v4(),
            "test-worker".to_string(),
            Utc::now(),
        );

        // No results = failed
        assert_eq!(result.calculate_status(), JobStatus::Failed);

        // All success
        result.target_results.push(TargetResult::success(
            "host1".to_string(),
            None,
            0,
            10,
        ));
        assert_eq!(result.calculate_status(), JobStatus::Success);

        // Partial success
        result.target_results.push(TargetResult::failure(
            "host2".to_string(),
            None,
            "error".to_string(),
            5,
            ExecutionPhase::SmbCopy,
        ));
        assert_eq!(result.calculate_status(), JobStatus::PartialSuccess);

        // All failed
        result.target_results.clear();
        result.target_results.push(TargetResult::failure(
            "host1".to_string(),
            None,
            "error".to_string(),
            5,
            ExecutionPhase::SmbCopy,
        ));
        assert_eq!(result.calculate_status(), JobStatus::Failed);
    }

    #[test]
    fn test_target_result_exit_codes() {
        // Exit code 0 = success
        let result = TargetResult::success("host".to_string(), None, 0, 10);
        assert!(result.success);

        // Exit code 3010 = reboot required, still success
        let result = TargetResult::success("host".to_string(), None, 3010, 10);
        assert!(result.success);

        // Other exit codes = failure
        let result = TargetResult::success("host".to_string(), None, 1, 10);
        assert!(!result.success);
    }

    #[test]
    fn test_job_deserialization() {
        let json = r#"{
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "jobType": "msi_install",
            "createdAt": "2025-01-01T12:00:00Z",
            "priority": 1,
            "payload": {
                "installerPath": "\\\\server\\share\\installer.msi",
                "vaultRef": "DeploymentWorker:SMB",
                "installArgs": "/qn",
                "enrollToken": "token123",
                "targets": [
                    {
                        "hostname": "target-01",
                        "machineId": "machine-uuid-here"
                    }
                ]
            }
        }"#;

        let job: DeploymentJob = serde_json::from_str(json).unwrap();
        assert_eq!(job.job_type, JobType::MsiInstall);
        assert_eq!(job.priority, 1);
        assert_eq!(job.payload.targets.len(), 1);
        assert_eq!(job.payload.targets[0].hostname, "target-01");
    }
}
