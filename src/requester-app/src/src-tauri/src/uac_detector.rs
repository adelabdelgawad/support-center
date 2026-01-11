/// UAC Detection Module
///
/// Detects Windows UAC (User Account Control) prompts.
/// UAC prompts run on the secure desktop which cannot be captured or controlled remotely.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

#[cfg(target_os = "windows")]
use windows::{
    Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};

#[cfg(target_os = "windows")]
use std::ffi::OsString;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStringExt;

/// Check if the current foreground window is a UAC prompt
#[cfg(target_os = "windows")]
fn is_uac_active() -> bool {
    unsafe {
        // Get the foreground window
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return false;
        }

        // Get the process ID of the foreground window
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id as *mut u32));

        if process_id == 0 {
            return false;
        }

        // Open the process to query its name
        match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
            Ok(process_handle) => {
                // Get the process image name
                let mut image_name = vec![0u16; 260];
                let mut size = image_name.len() as u32;

                #[cfg(target_os = "windows")]
                {
                    use windows::Win32::System::Threading::QueryFullProcessImageNameW;
                    use windows::Win32::System::Threading::PROCESS_NAME_WIN32;

                    match QueryFullProcessImageNameW(
                        process_handle,
                        PROCESS_NAME_WIN32,
                        windows::core::PWSTR(image_name.as_mut_ptr()),
                        &mut size,
                    ) {
                        Ok(_) => {
                            let process_name = OsString::from_wide(&image_name[..size as usize])
                                .to_string_lossy()
                                .to_lowercase();

                            // Check if it's consent.exe (UAC elevation prompt)
                            if process_name.contains("consent.exe") {
                                return true;
                            }
                        }
                        Err(_) => {}
                    }
                }

                false
            }
            Err(_) => false,
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn is_uac_active() -> bool {
    false
}

/// UAC Detector that polls for UAC prompts
pub struct UACDetector {
    running: Arc<AtomicBool>,
    uac_active: Arc<AtomicBool>,
}

impl UACDetector {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            uac_active: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Start detecting UAC prompts
    /// Returns a callback that will be called when UAC state changes
    pub async fn start<F>(&self, mut on_change: F)
    where
        F: FnMut(bool) + Send + 'static,
    {
        if self.running.swap(true, Ordering::SeqCst) {
            // Already running
            return;
        }

        let running = self.running.clone();
        let uac_active = self.uac_active.clone();

        tokio::spawn(async move {
            while running.load(Ordering::SeqCst) {
                let current_state = is_uac_active();
                let previous_state = uac_active.swap(current_state, Ordering::SeqCst);

                // Only call callback if state changed
                if current_state != previous_state {
                    on_change(current_state);
                }

                // Poll every 500ms
                sleep(Duration::from_millis(500)).await;
            }
        });
    }

    /// Stop detecting UAC prompts
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    /// Check if UAC is currently active
    pub fn is_active(&self) -> bool {
        self.uac_active.load(Ordering::SeqCst)
    }
}

impl Drop for UACDetector {
    fn drop(&mut self) {
        self.stop();
    }
}
