//! Result reporting with retry logic.
//!
//! Handles reporting job results back to the backend with
//! exponential backoff on failures.

use std::time::Duration;

use thiserror::Error;
use tracing::{debug, error, info, instrument, warn};

use crate::api::{ApiClient, ApiError};
use crate::api::types::JobResult;

/// Errors from result reporting
#[derive(Debug, Error)]
pub enum ReportError {
    #[error("Failed after {attempts} attempts: {last_error}")]
    MaxRetriesExceeded { attempts: u32, last_error: String },

    #[error("API error: {0}")]
    ApiError(#[from] ApiError),

    #[error("Reporting disabled")]
    Disabled,
}

/// Configuration for result reporting
#[derive(Debug, Clone)]
pub struct ReporterConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Initial delay between retries
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Backoff multiplier
    pub backoff_factor: f32,
}

impl Default for ReporterConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_factor: 2.0,
        }
    }
}

/// Result reporter with retry logic.
pub struct ResultReporter {
    config: ReporterConfig,
}

impl ResultReporter {
    /// Create a new result reporter with default configuration.
    pub fn new() -> Self {
        Self::with_config(ReporterConfig::default())
    }

    /// Create a new result reporter with custom configuration.
    pub fn with_config(config: ReporterConfig) -> Self {
        Self { config }
    }

    /// Report a job result with retry logic.
    ///
    /// Uses exponential backoff on failures, up to the configured
    /// maximum number of retries.
    ///
    /// # Arguments
    /// * `client` - API client for communication
    /// * `result` - The job result to report
    ///
    /// # Returns
    /// Ok(()) if the result was successfully reported.
    #[instrument(skip(self, client, result), fields(job_id = %result.job_id, status = ?result.status))]
    pub async fn report_with_retry(
        &self,
        client: &ApiClient,
        result: &JobResult,
    ) -> Result<(), ReportError> {
        let mut attempts = 0;
        let mut current_delay = self.config.initial_delay;
        let mut last_error = String::new();

        loop {
            attempts += 1;

            match client.report_result(result).await {
                Ok(()) => {
                    info!(
                        attempts,
                        "Result reported successfully"
                    );
                    return Ok(());
                }
                Err(e) => {
                    last_error = e.to_string();

                    // Check if we should retry
                    if !self.should_retry(&e) {
                        error!(error = %e, "Non-retryable error, giving up");
                        return Err(e.into());
                    }

                    if attempts >= self.config.max_retries {
                        error!(
                            attempts,
                            error = %last_error,
                            "Max retries exceeded"
                        );
                        return Err(ReportError::MaxRetriesExceeded {
                            attempts,
                            last_error,
                        });
                    }

                    warn!(
                        attempt = attempts,
                        max_attempts = self.config.max_retries,
                        delay_ms = current_delay.as_millis(),
                        error = %e,
                        "Report failed, retrying"
                    );

                    // Wait before retrying
                    tokio::time::sleep(current_delay).await;

                    // Increase delay for next attempt (exponential backoff)
                    current_delay = self.calculate_next_delay(current_delay);
                }
            }
        }
    }

    /// Check if an error is retryable.
    fn should_retry(&self, error: &ApiError) -> bool {
        match error {
            // Network errors are usually transient
            ApiError::RequestFailed(_) => true,
            // Server errors may be temporary
            ApiError::ServerError { status_code, .. } => {
                // Retry 5xx errors except 501 (Not Implemented)
                *status_code >= 500 && *status_code != 501
            }
            // Rate limiting should be retried
            ApiError::RateLimited { .. } => true,
            // Auth errors should not be retried (token refresh needed)
            ApiError::AuthenticationFailed(_) => false,
            // Credential errors should not be retried
            ApiError::CredentialError(_) => false,
            // Invalid response might be server-side issue
            ApiError::InvalidResponse(_) => true,
            // Job already claimed is not retryable
            ApiError::JobAlreadyClaimed => false,
        }
    }

    /// Calculate the next delay using exponential backoff.
    fn calculate_next_delay(&self, current: Duration) -> Duration {
        let next_secs = current.as_secs_f32() * self.config.backoff_factor;
        let max_secs = self.config.max_delay.as_secs_f32();
        Duration::from_secs_f32(next_secs.min(max_secs))
    }
}

impl Default for ResultReporter {
    fn default() -> Self {
        Self::new()
    }
}

/// Report a result with default retry settings.
///
/// Convenience function for simple reporting.
pub async fn report_result(client: &ApiClient, result: &JobResult) -> Result<(), ReportError> {
    ResultReporter::new()
        .report_with_retry(client, result)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ReporterConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_delay, Duration::from_secs(1));
        assert_eq!(config.backoff_factor, 2.0);
    }

    #[test]
    fn test_backoff_calculation() {
        let config = ReporterConfig {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_factor: 2.0,
        };
        let reporter = ResultReporter::with_config(config);

        // 1s -> 2s
        let next = reporter.calculate_next_delay(Duration::from_secs(1));
        assert_eq!(next, Duration::from_secs(2));

        // 2s -> 4s
        let next = reporter.calculate_next_delay(Duration::from_secs(2));
        assert_eq!(next, Duration::from_secs(4));

        // 20s -> 30s (capped at max)
        let next = reporter.calculate_next_delay(Duration::from_secs(20));
        assert_eq!(next, Duration::from_secs(30));
    }

    #[test]
    fn test_should_retry() {
        let reporter = ResultReporter::new();

        // Network errors should be retried
        assert!(reporter.should_retry(&ApiError::RequestFailed(
            reqwest::Error::from(std::io::Error::new(std::io::ErrorKind::TimedOut, "timeout"))
                .into()
        )));

        // Auth errors should not be retried
        assert!(!reporter.should_retry(&ApiError::AuthenticationFailed(
            "Invalid token".to_string()
        )));

        // Rate limiting should be retried
        assert!(reporter.should_retry(&ApiError::RateLimited {
            retry_after_seconds: 60
        }));
    }

    #[test]
    fn test_report_error_display() {
        let err = ReportError::MaxRetriesExceeded {
            attempts: 3,
            last_error: "Network error".to_string(),
        };
        assert!(err.to_string().contains("3 attempts"));
        assert!(err.to_string().contains("Network error"));
    }
}
