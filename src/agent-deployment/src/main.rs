//! Windows Deployment Worker
//!
//! A Windows service that polls for deployment jobs from a Python backend,
//! executes MSI installations on remote machines, and reports results.
//!
//! # Running Modes
//!
//! - **Service Mode** (default): Runs as a Windows Service managed by SCM
//! - **Console Mode** (`--console`): Runs interactively for debugging
//! - **Install** (`--install`): Installs the Windows Service
//! - **Uninstall** (`--uninstall`): Removes the Windows Service

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod audit;
mod config;
mod credentials;
mod execution;
mod jobs;

use std::env;
use std::ffi::OsString;
use std::time::Duration;

use tracing::{error, info, warn};

use crate::api::ApiClient;
use crate::audit::{audit_event, init_logging, AuditEvent, AuditEventType};
use crate::config::Config;
use crate::jobs::{create_shutdown_channel, JobExecutor, JobPoller};

/// Service name for Windows Service registration
const SERVICE_NAME: &str = "DeploymentWorker";
const SERVICE_DISPLAY_NAME: &str = "Deployment Worker Service";
const SERVICE_DESCRIPTION: &str = "Handles MSI deployment jobs from the IT Service Catalog";

fn main() {
    // Parse command line arguments
    let args: Vec<String> = env::args().collect();

    // Handle command line options
    if args.len() > 1 {
        match args[1].as_str() {
            "--console" | "-c" => {
                if let Err(e) = run_console_mode() {
                    eprintln!("Console mode error: {}", e);
                    std::process::exit(1);
                }
                return;
            }
            "--install" | "-i" => {
                #[cfg(windows)]
                {
                    if let Err(e) = install_service() {
                        eprintln!("Failed to install service: {}", e);
                        std::process::exit(1);
                    }
                    println!("Service installed successfully");
                    return;
                }
                #[cfg(not(windows))]
                {
                    eprintln!("Service installation only available on Windows");
                    std::process::exit(1);
                }
            }
            "--uninstall" | "-u" => {
                #[cfg(windows)]
                {
                    if let Err(e) = uninstall_service() {
                        eprintln!("Failed to uninstall service: {}", e);
                        std::process::exit(1);
                    }
                    println!("Service uninstalled successfully");
                    return;
                }
                #[cfg(not(windows))]
                {
                    eprintln!("Service uninstallation only available on Windows");
                    std::process::exit(1);
                }
            }
            "--help" | "-h" => {
                print_help();
                return;
            }
            "--version" | "-v" => {
                println!("Deployment Worker {}", env!("CARGO_PKG_VERSION"));
                return;
            }
            _ => {
                eprintln!("Unknown option: {}", args[1]);
                print_help();
                std::process::exit(1);
            }
        }
    }

    // Default: Run as Windows Service
    #[cfg(windows)]
    {
        if let Err(e) = run_as_service() {
            // Can't use logging here as it may not be initialized
            eprintln!("Service error: {}", e);
            std::process::exit(1);
        }
    }

    #[cfg(not(windows))]
    {
        // On non-Windows, default to console mode
        if let Err(e) = run_console_mode() {
            eprintln!("Console mode error: {}", e);
            std::process::exit(1);
        }
    }
}

fn print_help() {
    println!("Deployment Worker - MSI Deployment Service");
    println!();
    println!("Usage: agent-deployment [OPTIONS]");
    println!();
    println!("Options:");
    println!("  --console, -c     Run in console mode (interactive)");
    println!("  --install, -i     Install Windows Service");
    println!("  --uninstall, -u   Uninstall Windows Service");
    println!("  --help, -h        Show this help message");
    println!("  --version, -v     Show version information");
    println!();
    println!("Without options, runs as a Windows Service.");
}

/// Run in console mode (for debugging and development)
fn run_console_mode() -> Result<(), Box<dyn std::error::Error>> {
    // Load configuration
    #[cfg(feature = "mock-mode")]
    let config = Config::load_mock();

    #[cfg(not(feature = "mock-mode"))]
    let config = Config::load()?;

    // Initialize logging
    init_logging(&config.logging)?;

    info!(
        version = env!("CARGO_PKG_VERSION"),
        mock_mode = config.mock_mode,
        "Starting Deployment Worker in console mode"
    );

    // Create tokio runtime
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    rt.block_on(async {
        run_worker(config).await
    })
}

/// Main worker logic
async fn run_worker(config: Config) -> Result<(), Box<dyn std::error::Error>> {
    let worker_id = config.get_worker_id();

    info!(worker_id = %worker_id, "Initializing worker");

    // Audit: Worker started
    audit_event(
        AuditEvent::new(AuditEventType::WorkerStarted, "started", "Worker initialization")
            .with_worker_id(&worker_id),
    );

    // Create API client
    let api_client = ApiClient::new(config.api.clone(), worker_id.clone()).await?;

    // Create executor
    let executor = JobExecutor::new(config.worker.clone(), worker_id.clone());

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = create_shutdown_channel();

    // Setup Ctrl+C handler for console mode
    let shutdown_tx_clone = shutdown_tx.clone();
    tokio::spawn(async move {
        if let Err(e) = tokio::signal::ctrl_c().await {
            error!(error = %e, "Failed to listen for Ctrl+C");
            return;
        }
        info!("Ctrl+C received, initiating shutdown");
        let _ = shutdown_tx_clone.send(true);
    });

    // Create and run poller
    let mut poller = JobPoller::new(api_client, executor, config.worker.clone(), shutdown_rx);

    info!("Worker started, beginning poll loop");
    poller.run().await;

    // Audit: Worker stopped
    audit_event(
        AuditEvent::new(AuditEventType::WorkerStopped, "stopped", "Worker shutdown complete")
            .with_worker_id(&worker_id),
    );

    info!("Worker stopped gracefully");
    Ok(())
}

/// Windows Service implementation
#[cfg(windows)]
mod windows_service_impl {
    use super::*;
    use std::sync::mpsc;
    use windows_service::{
        define_windows_service,
        service::{
            ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
            ServiceType,
        },
        service_control_handler::{self, ServiceControlHandlerResult},
        service_dispatcher,
    };

    // Generate the service main function
    define_windows_service!(ffi_service_main, service_main);

    /// Run as a Windows Service
    pub fn run_as_service() -> Result<(), windows_service::Error> {
        service_dispatcher::start(SERVICE_NAME, ffi_service_main)
    }

    /// Service main function called by Windows SCM
    fn service_main(_arguments: Vec<OsString>) {
        if let Err(e) = run_service() {
            // Log to Windows Event Log
            let _ = log_to_event_log(&format!("Service failed: {}", e));
        }
    }

    /// Run the service with proper lifecycle management
    fn run_service() -> Result<(), Box<dyn std::error::Error>> {
        // Load configuration first
        let config = Config::load()?;

        // Initialize logging
        init_logging(&config.logging)?;

        info!(
            version = env!("CARGO_PKG_VERSION"),
            "Starting Deployment Worker as Windows Service"
        );

        // Create channel for shutdown signaling
        let (shutdown_tx, shutdown_rx) = create_shutdown_channel();
        let (status_tx, status_rx) = mpsc::channel();

        // Register service control handler
        let shutdown_tx_clone = shutdown_tx.clone();
        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop | ServiceControl::Shutdown => {
                    info!("Received stop signal from SCM");
                    let _ = shutdown_tx_clone.send(true);
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;

        // Send starting status
        status_handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::StartPending,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::from_secs(10),
            process_id: None,
        })?;

        // Create tokio runtime
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()?;

        // Notify SCM that we're running
        status_handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })?;

        // Run the worker
        let result = rt.block_on(async {
            run_worker(config).await
        });

        // Notify SCM that we're stopping
        status_handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::StopPending,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::from_secs(5),
            process_id: None,
        })?;

        // Final stopped status
        let exit_code = match &result {
            Ok(_) => ServiceExitCode::Win32(0),
            Err(_) => ServiceExitCode::Win32(1),
        };

        status_handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Stopped,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code,
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })?;

        result.map_err(|e| e.into())
    }

    /// Log a message to Windows Event Log
    fn log_to_event_log(message: &str) -> Result<(), Box<dyn std::error::Error>> {
        // For now, just write to stderr which will be captured by SCM
        eprintln!("[DeploymentWorker] {}", message);
        Ok(())
    }
}

#[cfg(windows)]
use windows_service_impl::run_as_service;

/// Install the Windows Service
#[cfg(windows)]
fn install_service() -> Result<(), Box<dyn std::error::Error>> {
    use std::ffi::OsStr;
    use windows_service::{
        service::{ServiceAccess, ServiceErrorControl, ServiceInfo, ServiceStartType, ServiceType},
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    let manager = ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CREATE_SERVICE)?;

    let exe_path = std::env::current_exe()?;

    let service_info = ServiceInfo {
        name: OsString::from(SERVICE_NAME),
        display_name: OsString::from(SERVICE_DISPLAY_NAME),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: exe_path,
        launch_arguments: vec![],
        dependencies: vec![],
        account_name: None, // LocalSystem
        account_password: None,
    };

    let service = manager.create_service(&service_info, ServiceAccess::CHANGE_CONFIG)?;

    // Set service description
    service.set_description(SERVICE_DESCRIPTION)?;

    println!("Service '{}' installed successfully", SERVICE_NAME);
    println!("Start with: sc start {}", SERVICE_NAME);

    Ok(())
}

/// Uninstall the Windows Service
#[cfg(windows)]
fn uninstall_service() -> Result<(), Box<dyn std::error::Error>> {
    use std::ffi::OsStr;
    use std::thread;
    use std::time::Duration;
    use windows_service::{
        service::{ServiceAccess, ServiceState},
        service_manager::{ServiceManager, ServiceManagerAccess},
    };

    let manager = ServiceManager::local_computer(None::<&OsStr>, ServiceManagerAccess::CONNECT)?;

    let service = manager.open_service(
        SERVICE_NAME,
        ServiceAccess::STOP | ServiceAccess::DELETE | ServiceAccess::QUERY_STATUS,
    )?;

    // Try to stop the service if it's running
    let status = service.query_status()?;
    if status.current_state != ServiceState::Stopped {
        println!("Stopping service...");
        service.stop()?;

        // Wait for service to stop
        for _ in 0..30 {
            thread::sleep(Duration::from_secs(1));
            let status = service.query_status()?;
            if status.current_state == ServiceState::Stopped {
                break;
            }
        }
    }

    // Delete the service
    service.delete()?;

    println!("Service '{}' uninstalled successfully", SERVICE_NAME);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_constants() {
        assert_eq!(SERVICE_NAME, "DeploymentWorker");
        assert!(!SERVICE_DISPLAY_NAME.is_empty());
        assert!(!SERVICE_DESCRIPTION.is_empty());
    }
}
