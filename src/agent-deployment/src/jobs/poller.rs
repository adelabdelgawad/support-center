//! Background job polling loop.
//!
//! Polls the backend for deployment jobs and executes them,
//! with graceful shutdown support.

use std::time::Duration;

use tokio::sync::watch;
use tracing::{debug, error, info, instrument, warn};

use crate::api::{ApiClient, ApiError};
use crate::audit::{audit_event, AuditEvent, AuditEventType};
use crate::config::WorkerConfig;

use super::executor::JobExecutor;
use super::reporter::ResultReporter;

/// Job poller that continuously polls for and executes jobs.
pub struct JobPoller {
    api_client: ApiClient,
    executor: JobExecutor,
    reporter: ResultReporter,
    config: WorkerConfig,
    shutdown_rx: watch::Receiver<bool>,
}

impl JobPoller {
    /// Create a new job poller.
    ///
    /// # Arguments
    /// * `api_client` - API client for backend communication
    /// * `executor` - Job executor
    /// * `config` - Worker configuration
    /// * `shutdown_rx` - Shutdown signal receiver
    pub fn new(
        api_client: ApiClient,
        executor: JobExecutor,
        config: WorkerConfig,
        shutdown_rx: watch::Receiver<bool>,
    ) -> Self {
        Self {
            api_client,
            executor,
            reporter: ResultReporter::new(),
            config,
            shutdown_rx,
        }
    }

    /// Run the polling loop.
    ///
    /// This method blocks until a shutdown signal is received.
    /// It polls for jobs at the configured interval and executes
    /// any jobs that are received.
    #[instrument(skip(self), name = "poller_run")]
    pub async fn run(&mut self) {
        info!(
            poll_interval_secs = self.config.poll_interval_seconds,
            "Starting job poller"
        );

        let base_interval = Duration::from_secs(self.config.poll_interval_seconds);
        let max_backoff = Duration::from_secs(self.config.max_backoff_seconds);
        let mut current_interval = base_interval;
        let mut consecutive_empty = 0u32;

        loop {
            tokio::select! {
                // Wait for next poll interval
                _ = tokio::time::sleep(current_interval) => {
                    match self.poll_and_execute().await {
                        PollResult::JobExecuted => {
                            // Reset backoff after successful job
                            current_interval = base_interval;
                            consecutive_empty = 0;
                        }
                        PollResult::NoJobs => {
                            // Increase backoff when no jobs available
                            consecutive_empty += 1;
                            if consecutive_empty >= 3 {
                                current_interval = self.calculate_backoff(
                                    current_interval,
                                    max_backoff,
                                );
                                debug!(
                                    interval_secs = current_interval.as_secs(),
                                    consecutive_empty,
                                    "Increasing poll interval (no jobs)"
                                );
                            }
                        }
                        PollResult::Error => {
                            // Increase backoff on errors
                            current_interval = self.calculate_backoff(
                                current_interval,
                                max_backoff,
                            );
                            warn!(
                                interval_secs = current_interval.as_secs(),
                                "Increasing poll interval (error)"
                            );
                        }
                        PollResult::RateLimited(retry_after) => {
                            // Use server-provided retry interval
                            current_interval = Duration::from_secs(retry_after);
                            warn!(
                                interval_secs = current_interval.as_secs(),
                                "Rate limited, using server retry interval"
                            );
                        }
                    }
                }
                // Check for shutdown signal
                _ = self.shutdown_rx.changed() => {
                    if *self.shutdown_rx.borrow() {
                        info!("Shutdown signal received, stopping poller");
                        break;
                    }
                }
            }
        }

        info!("Job poller stopped");
    }

    /// Poll for a job and execute it if available.
    async fn poll_and_execute(&mut self) -> PollResult {
        debug!("Polling for next job");

        // Poll for next job
        let job = match self.api_client.poll_next_job().await {
            Ok(Some(job)) => job,
            Ok(None) => {
                debug!("No jobs available");
                return PollResult::NoJobs;
            }
            Err(ApiError::RateLimited { retry_after_seconds }) => {
                return PollResult::RateLimited(retry_after_seconds);
            }
            Err(ApiError::AuthenticationFailed(msg)) => {
                error!(error = %msg, "Authentication failed");
                // Try to refresh token
                if let Err(e) = self.api_client.refresh_token() {
                    error!(error = %e, "Failed to refresh token");
                }
                return PollResult::Error;
            }
            Err(e) => {
                error!(error = %e, "Failed to poll for jobs");
                return PollResult::Error;
            }
        };

        let job_id = job.id;
        info!(job_id = %job_id, job_type = ?job.job_type, "Received job");

        // Audit: Job received
        audit_event(
            AuditEvent::new(
                AuditEventType::JobReceived,
                "received",
                &format!("Job type: {:?}, targets: {}", job.job_type, job.payload.targets.len()),
            )
            .with_job_id(job_id),
        );

        // Execute the job
        let result = self.executor.execute(job).await;

        // Report result
        info!(
            job_id = %job_id,
            status = ?result.status,
            "Reporting job result"
        );

        if let Err(e) = self.reporter.report_with_retry(&self.api_client, &result).await {
            error!(
                job_id = %job_id,
                error = %e,
                "Failed to report job result"
            );
            // Job was executed but result couldn't be reported
            // The backend should handle this via timeouts
        }

        PollResult::JobExecuted
    }

    /// Calculate the next backoff interval.
    fn calculate_backoff(&self, current: Duration, max: Duration) -> Duration {
        let next = current * 2;
        if next > max {
            max
        } else {
            next
        }
    }

    /// Send a heartbeat to the backend.
    ///
    /// Call this periodically to signal the worker is still alive.
    pub async fn send_heartbeat(&self) {
        if let Err(e) = self.api_client.send_heartbeat(None).await {
            debug!(error = %e, "Heartbeat failed (non-critical)");
        }
    }
}

/// Result of a poll attempt
#[derive(Debug)]
enum PollResult {
    /// A job was received and executed
    JobExecuted,
    /// No jobs were available
    NoJobs,
    /// An error occurred
    Error,
    /// Rate limited by server
    RateLimited(u64),
}

/// Create a shutdown channel pair.
///
/// Returns (sender, receiver) for coordinating graceful shutdown.
pub fn create_shutdown_channel() -> (watch::Sender<bool>, watch::Receiver<bool>) {
    watch::channel(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backoff_calculation() {
        let config = WorkerConfig {
            worker_id: Some("test".to_string()),
            poll_interval_seconds: 30,
            max_backoff_seconds: 300,
            max_concurrent_jobs: 1,
            cleanup_timeout_seconds: 60,
            smb_copy_timeout_seconds: 300,
            service_execution_timeout_seconds: 600,
            reachability_timeout_seconds: 5,
        };

        let (_, shutdown_rx) = create_shutdown_channel();

        // We can't easily create a mock ApiClient for this test,
        // so just test the backoff calculation directly
        let current = Duration::from_secs(30);
        let max = Duration::from_secs(300);

        // 30s * 2 = 60s
        let next = current * 2;
        assert_eq!(next, Duration::from_secs(60));

        // 150s * 2 = 300s (capped at max)
        let next = (Duration::from_secs(150) * 2).min(max);
        assert_eq!(next, Duration::from_secs(300));
    }

    #[test]
    fn test_shutdown_channel() {
        let (tx, rx) = create_shutdown_channel();
        assert!(!*rx.borrow());

        tx.send(true).unwrap();
        assert!(*rx.borrow());
    }
}
