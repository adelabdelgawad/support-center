//! HTTP API client for communication with the Python backend.
//!
//! Handles authentication via static API token from Windows Credential Manager
//! and provides methods for polling jobs and reporting results.

use std::time::Duration;

use reqwest::{header, Client, StatusCode};
use thiserror::Error;
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

use crate::config::ApiConfig;
use crate::credentials::{Credential, CredentialVault, VaultError};

use super::types::{ApiErrorResponse, DeploymentJob, JobResult};

/// Errors from API operations
#[derive(Debug, Error)]
pub enum ApiError {
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Server error ({status_code}): {message}")]
    ServerError { status_code: u16, message: String },

    #[error("Credential error: {0}")]
    CredentialError(#[from] VaultError),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Rate limited, retry after {retry_after_seconds}s")]
    RateLimited { retry_after_seconds: u64 },

    #[error("Job already claimed")]
    JobAlreadyClaimed,
}

/// HTTP client for the deployment API
pub struct ApiClient {
    client: Client,
    config: ApiConfig,
    /// Cached API token (refreshed periodically)
    api_token: String,
    /// Worker ID for job claiming
    worker_id: String,
}

impl ApiClient {
    /// Create a new API client.
    ///
    /// # Arguments
    /// * `config` - API configuration
    /// * `worker_id` - Unique worker identifier
    ///
    /// # Returns
    /// A configured API client or an error if credential retrieval fails.
    pub async fn new(config: ApiConfig, worker_id: String) -> Result<Self, ApiError> {
        let api_token = Self::load_api_token(&config.credential_target)?;

        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(2)
            .build()?;

        Ok(Self {
            client,
            config,
            api_token,
            worker_id,
        })
    }

    /// Load API token from Windows Credential Manager.
    fn load_api_token(credential_target: &str) -> Result<String, ApiError> {
        #[cfg(all(windows, feature = "mock-mode"))]
        {
            let cred = CredentialVault::get_mock_credential(credential_target)?;
            return Ok(cred.password.clone());
        }

        #[cfg(not(all(windows, feature = "mock-mode")))]
        {
            let cred = CredentialVault::get_credential(credential_target)?;
            Ok(cred.password.clone())
        }
    }

    /// Refresh the API token from Windows Credential Manager.
    ///
    /// Call this periodically for long-running services to pick up token rotations.
    pub fn refresh_token(&mut self) -> Result<(), ApiError> {
        self.api_token = Self::load_api_token(&self.config.credential_target)?;
        info!("API token refreshed");
        Ok(())
    }

    /// Poll for the next available deployment job.
    ///
    /// # Returns
    /// * `Ok(Some(job))` - A job is available and has been claimed
    /// * `Ok(None)` - No jobs available (204 response)
    /// * `Err(_)` - An error occurred
    #[instrument(skip(self), fields(worker_id = %self.worker_id))]
    pub async fn poll_next_job(&self) -> Result<Option<DeploymentJob>, ApiError> {
        let url = format!("{}{}", self.config.base_url, self.config.poll_endpoint);

        debug!(url = %url, "Polling for next job");

        let response = self
            .client
            .get(&url)
            .header(header::AUTHORIZATION, format!("Bearer {}", self.api_token))
            .header("X-Worker-ID", &self.worker_id)
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => {
                let job: DeploymentJob = response.json().await.map_err(|e| {
                    ApiError::InvalidResponse(format!("Failed to parse job: {}", e))
                })?;
                info!(job_id = %job.id, job_type = ?job.job_type, "Received deployment job");
                Ok(Some(job))
            }
            StatusCode::NO_CONTENT => {
                debug!("No jobs available");
                Ok(None)
            }
            StatusCode::UNAUTHORIZED => {
                Err(ApiError::AuthenticationFailed("Invalid or expired token".to_string()))
            }
            StatusCode::TOO_MANY_REQUESTS => {
                let retry_after = response
                    .headers()
                    .get("Retry-After")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(60);
                warn!(retry_after, "Rate limited by backend");
                Err(ApiError::RateLimited {
                    retry_after_seconds: retry_after,
                })
            }
            StatusCode::CONFLICT => {
                debug!("Job already claimed by another worker");
                Err(ApiError::JobAlreadyClaimed)
            }
            status => {
                let error_body = response.text().await.unwrap_or_default();
                let message = serde_json::from_str::<ApiErrorResponse>(&error_body)
                    .map(|e| e.detail)
                    .unwrap_or(error_body);
                error!(status = %status, message = %message, "API error");
                Err(ApiError::ServerError {
                    status_code: status.as_u16(),
                    message,
                })
            }
        }
    }

    /// Report job execution result to the backend.
    ///
    /// # Arguments
    /// * `result` - The job execution result
    ///
    /// # Returns
    /// Ok(()) if the result was successfully reported.
    #[instrument(skip(self, result), fields(job_id = %result.job_id, status = ?result.status))]
    pub async fn report_result(&self, result: &JobResult) -> Result<(), ApiError> {
        let url = format!(
            "{}{}",
            self.config.base_url,
            self.config.report_endpoint.replace("{id}", &result.job_id.to_string())
        );

        debug!(url = %url, "Reporting job result");

        let response = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, format!("Bearer {}", self.api_token))
            .header("X-Worker-ID", &self.worker_id)
            .json(result)
            .send()
            .await?;

        match response.status() {
            StatusCode::OK | StatusCode::CREATED | StatusCode::ACCEPTED => {
                info!(job_id = %result.job_id, "Result reported successfully");
                Ok(())
            }
            StatusCode::UNAUTHORIZED => {
                Err(ApiError::AuthenticationFailed("Invalid or expired token".to_string()))
            }
            StatusCode::NOT_FOUND => {
                warn!(job_id = %result.job_id, "Job not found, may have been cancelled");
                // Consider this a success - the backend doesn't have the job anymore
                Ok(())
            }
            status => {
                let error_body = response.text().await.unwrap_or_default();
                let message = serde_json::from_str::<ApiErrorResponse>(&error_body)
                    .map(|e| e.detail)
                    .unwrap_or(error_body);
                error!(status = %status, message = %message, "Failed to report result");
                Err(ApiError::ServerError {
                    status_code: status.as_u16(),
                    message,
                })
            }
        }
    }

    /// Send a heartbeat to the backend (if supported).
    ///
    /// This can be used to signal that the worker is still alive and processing.
    #[instrument(skip(self))]
    pub async fn send_heartbeat(&self, job_id: Option<Uuid>) -> Result<(), ApiError> {
        let url = format!("{}/internal/workers/{}/heartbeat", self.config.base_url, self.worker_id);

        let body = serde_json::json!({
            "workerId": self.worker_id,
            "currentJobId": job_id,
            "timestamp": chrono::Utc::now(),
        });

        let response = self
            .client
            .post(&url)
            .header(header::AUTHORIZATION, format!("Bearer {}", self.api_token))
            .json(&body)
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                debug!("Heartbeat sent successfully");
                Ok(())
            }
            Ok(resp) => {
                // Heartbeat failures are not critical
                debug!(status = %resp.status(), "Heartbeat response");
                Ok(())
            }
            Err(e) => {
                // Log but don't fail on heartbeat errors
                warn!(error = %e, "Failed to send heartbeat");
                Ok(())
            }
        }
    }
}

/// Mock API client for testing
#[cfg(feature = "mock-mode")]
pub mod mock {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static CALL_COUNT: AtomicU32 = AtomicU32::new(0);

    impl ApiClient {
        /// Create a mock API client for testing
        pub fn new_mock(config: ApiConfig, worker_id: String) -> Self {
            Self {
                client: Client::new(),
                config,
                api_token: "mock-token".to_string(),
                worker_id,
            }
        }

        /// Mock poll that returns a sample job every 3rd call
        pub async fn poll_next_job_mock(&self) -> Result<Option<DeploymentJob>, ApiError> {
            use crate::api::types::{DeploymentTarget, JobPayload, JobType};
            use chrono::Utc;

            let count = CALL_COUNT.fetch_add(1, Ordering::Relaxed);

            if count % 3 == 0 {
                info!("[MOCK] Returning sample deployment job");
                Ok(Some(DeploymentJob {
                    id: Uuid::new_v4(),
                    job_type: JobType::MsiInstall,
                    created_at: Utc::now(),
                    priority: 1,
                    payload: JobPayload {
                        installer_path: "\\\\mock-server\\share\\test.msi".to_string(),
                        vault_ref: "DeploymentWorker:Mock".to_string(),
                        install_args: Some("/qn".to_string()),
                        enroll_token: Some("test-token-12345".to_string()),
                        targets: vec![DeploymentTarget {
                            hostname: "mock-target-01".to_string(),
                            vault_ref: None,
                            machine_id: Some("mock-machine-id".to_string()),
                        }],
                        product_code: None,
                        force_restart: false,
                    },
                    claimed_by: Some(self.worker_id.clone()),
                    claimed_at: Some(Utc::now()),
                }))
            } else {
                debug!("[MOCK] No jobs available");
                Ok(None)
            }
        }

        /// Mock report that just logs
        pub async fn report_result_mock(&self, result: &JobResult) -> Result<(), ApiError> {
            info!(
                job_id = %result.job_id,
                status = ?result.status,
                targets = result.target_results.len(),
                "[MOCK] Would report result to backend"
            );
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_error_display() {
        let err = ApiError::ServerError {
            status_code: 500,
            message: "Internal error".to_string(),
        };
        assert!(err.to_string().contains("500"));
        assert!(err.to_string().contains("Internal error"));
    }

    #[test]
    fn test_rate_limited_error() {
        let err = ApiError::RateLimited {
            retry_after_seconds: 60,
        };
        assert!(err.to_string().contains("60"));
    }
}
