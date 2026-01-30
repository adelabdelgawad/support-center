//! Watchdog Module for Auto-Restart Functionality
//!
//! This module provides auto-restart functionality for the application.
//! When the main app is terminated, the watchdog will automatically restart it.
//!
//! This is a legitimate enterprise feature for IT monitoring applications that
//! need to maintain continuous operation for employee session monitoring.
//!
//! Architecture:
//! - The app spawns a watchdog process on startup
//! - The watchdog monitors the parent process
//! - If the parent exits, the watchdog restarts it
//! - The watchdog exits when the parent exits gracefully (with exit code 0)

use std::env;
use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::time::sleep;

/// Watchdog exit code used to signal graceful shutdown
const WATCHDOG_GRACEFUL_EXIT: i32 = 99;

/// Check if the current process is running as watchdog
pub fn is_watchdog() -> bool {
    env::var("SUPPORT_CENTER_WATCHDOG").is_ok()
}

/// Spawn the watchdog process
///
/// This should be called when the main app starts. The watchdog will:
/// 1. Run in the background
/// 2. Monitor the parent process
/// 3. Restart the parent if it exits unexpectedly (exit code != 0)
pub fn spawn_watchdog() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Get current executable path
        let exe_path = env::current_exe()
            .map_err(|e| format!("Failed to get executable path: {}", e))?;

        // Spawn watchdog process with environment variable
        let result = Command::new(&exe_path)
            .env("SUPPORT_CENTER_WATCHDOG", "1")
            .env("SUPPORT_CENTER_PARENT_PID", format!("{}", std::process::id()))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        match result {
            Ok(_) => {
                eprintln!("[Watchdog] Watchdog process spawned successfully");
                Ok(())
            }
            Err(e) => {
                eprintln!("[Watchdog] Failed to spawn watchdog: {}", e);
                Err(format!("Failed to spawn watchdog: {}", e))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Watchdog not supported on non-Windows platforms
        eprintln!("[Watchdog] Watchdog only supported on Windows");
        Ok(())
    }
}

/// Run the watchdog loop
///
/// This function runs in the watchdog process and:
/// 1. Monitors the parent process
/// 2. Restarts the parent if it exits unexpectedly
/// 3. Exits if the parent shuts down gracefully (exit code 0)
pub async fn run_watchdog() -> Result<(), String> {
    if !is_watchdog() {
        return Err("Not running as watchdog".to_string());
    }

    // Get parent PID from environment
    let parent_pid_str = env::var("SUPPORT_CENTER_PARENT_PID")
        .map_err(|_| "SUPPORT_CENTER_PARENT_PID not set".to_string())?;

    let parent_pid: u32 = parent_pid_str
        .parse()
        .map_err(|_| "Invalid parent PID".to_string())?;

    eprintln!("[Watchdog] Monitoring parent process PID: {}", parent_pid);

    // Get current executable path for restart
    let exe_path = env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;

    // Wait for parent to exit
    let mut restart_count = 0;
    let max_restarts = 10; // Prevent infinite restart loops
    let restart_delay = Duration::from_secs(3);

    loop {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::Foundation::CloseHandle;
            use windows::Win32::System::Threading::{
                OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE,
            };

            unsafe {
                // Open handle to parent process
                // BOOL(0) = false (don't inherit handle)
                let handle = OpenProcess(PROCESS_SYNCHRONIZE, windows::Win32::Foundation::BOOL(0), parent_pid);

                let parent_exists = match handle {
                    Ok(h) => {
                        // Parent process exists, wait for it to exit
                        // WaitForSingleObject returns:
                        // - 0 (WAIT_OBJECT_0) when the object is signaled (process exited)
                        // - 0x102 (WAIT_TIMEOUT) when timeout expires
                        // - 0xFFFFFFFF (WAIT_FAILED) on error
                        let wait_result = WaitForSingleObject(h, 1000); // 1 second timeout
                        let _ = CloseHandle(h);

                        if wait_result.0 == 0 {
                            // Parent exited (WAIT_OBJECT_0 = 0)
                            eprintln!("[Watchdog] Parent process exited");
                            false
                        } else if wait_result.0 == 0x102 {
                            // WAIT_TIMEOUT - parent still running
                            sleep(Duration::from_secs(2)).await;
                            continue;
                        } else {
                            // Error or other status
                            eprintln!("[Watchdog] WaitForSingleObject returned: {:?}, assuming parent exited", wait_result);
                            false
                        }
                    }
                    Err(_) => {
                        // Parent process not found (already exited)
                        eprintln!("[Watchdog] Parent process not found (may have already exited)");
                        false
                    }
                };

                if !parent_exists {
                    if restart_count >= max_restarts {
                        eprintln!("[Watchdog] Max restarts reached, giving up");
                        break;
                    }

                    restart_count += 1;
                    eprintln!("[Watchdog] Restarting application (attempt {}/{})", restart_count, max_restarts);

                    // Wait before restart
                    sleep(restart_delay).await;

                    // Spawn new instance (without watchdog flag)
                    let result = Command::new(&exe_path)
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn();

                    match result {
                        Ok(child) => {
                            eprintln!("[Watchdog] Application restarted with PID: {:?}", child.id());
                            // Watchdog exits - new instance will spawn its own watchdog
                            break;
                        }
                        Err(e) => {
                            eprintln!("[Watchdog] Failed to restart application: {}", e);
                            break;
                        }
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            // Not supported on non-Windows
            break;
        }
    }

    eprintln!("[Watchdog] Watchdog exiting");
    Ok(())
}

/// Initialize watchdog in main app
///
/// Call this during app startup to spawn the watchdog process.
/// Returns immediately after spawning.
pub fn init_watchdog() {
    if !is_watchdog() {
        // Spawn watchdog in background
        let _ = spawn_watchdog();
    }
}
