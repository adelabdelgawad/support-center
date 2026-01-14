// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// ============================================================================
// SECURITY DOCUMENTATION (Finding #43 - CSP in Tauri Context)
// ============================================================================
//
// Content Security Policy (CSP) is configured in tauri.conf.json under app.security.csp.
// Current policy includes 'unsafe-inline' and 'unsafe-eval' for script-src.
//
// THREAT MODEL CONSIDERATIONS FOR TAURI DESKTOP APPS:
//
// 1. Tauri apps differ from browser apps:
//    - Code is bundled locally and signed (not fetched remotely)
//    - Primary attack vector (remote content injection) doesn't apply
//    - The app binary itself is the trust boundary, not the CSP
//
// 2. CSP provides DEFENSE-IN-DEPTH only:
//    - Acts as a secondary mitigation layer
//    - Reduces impact if frontend code has vulnerabilities
//    - Cannot prevent attacks if binary is compromised
//
// 3. Why 'unsafe-inline' and 'unsafe-eval' are acceptable here:
//    - Required for SolidJS/modern frameworks to function
//    - No remote content injection risk (app is self-contained)
//    - frame-src 'none' prevents framing attacks
//
// TODO (Future enhancement - Option C):
// For production builds, consider removing localhost wildcards from connect-src:
// - Remove: http://localhost:* ws://localhost:*
// - Keep only production endpoints: https://supportcenter.andalusiagroup.net
// This reduces attack surface in distributed builds.
//
// ============================================================================

use std::env;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Listener, Manager};
use base64::{Engine as _, engine::general_purpose};

// Remote input injection module
mod remote_input;

// UAC detection module
mod uac_detector;

// Persistent storage module
mod storage;

// Windows auto-start module (registry-based)
mod autostart;

// Session logging module (file-based debug logs)
mod logging;

// Data migration module (app data directory relocation)
mod migration;

// ============================================================================
// PERFORMANCE OPTIMIZATION: Screen Dimension Caching for Mouse Positioning
// ============================================================================
// Cache screen dimensions using GetSystemMetrics for consistent mouse positioning.
// IMPORTANT: We use GetSystemMetrics (not xcap) because:
// 1. SendInput with MOUSEEVENTF_ABSOLUTE uses SM_CXSCREEN/SM_CYSCREEN coordinate space
// 2. GetSystemMetrics returns DPI-aware dimensions that Windows uses for input
// 3. xcap might return different values on high-DPI displays

#[cfg(target_os = "windows")]
static CACHED_SCREEN_DIMS: OnceLock<(i32, i32)> = OnceLock::new();

#[cfg(not(target_os = "windows"))]
static CACHED_SCREEN_DIMS: OnceLock<(i32, i32)> = OnceLock::new();

/// Get screen dimensions for mouse positioning (width, height)
/// Uses GetSystemMetrics on Windows for accurate mouse coordinate mapping.
/// Cached after first call for performance.
#[cfg(target_os = "windows")]
fn get_screen_dims_for_mouse() -> (i32, i32) {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    *CACHED_SCREEN_DIMS.get_or_init(|| {
        unsafe {
            let w = GetSystemMetrics(SM_CXSCREEN);
            let h = GetSystemMetrics(SM_CYSCREEN);
            eprintln!("[get_screen_dims_for_mouse] Screen dimensions: {}x{}", w, h);
            (w, h)
        }
    })
}

#[cfg(not(target_os = "windows"))]
fn get_screen_dims_for_mouse() -> (i32, i32) {
    *CACHED_SCREEN_DIMS.get_or_init(|| {
        // Fallback for non-Windows: use xcap
        match xcap::Monitor::all() {
            Ok(monitors) => {
                if let Some(monitor) = monitors.first() {
                    let w = monitor.width().unwrap_or(1920) as i32;
                    let h = monitor.height().unwrap_or(1080) as i32;
                    (w, h)
                } else {
                    (1920, 1080)
                }
            }
            Err(_) => (1920, 1080)
        }
    })
}

// Keep the xcap-based function for other uses (window positioning, etc.)
static CACHED_MONITOR_DIMS: OnceLock<(i32, i32, i32, i32)> = OnceLock::new();

/// Get primary monitor dimensions from xcap (x, y, width, height)
/// Used for window positioning, NOT for mouse coordinate mapping.
fn get_primary_monitor_dims() -> (i32, i32, i32, i32) {
    *CACHED_MONITOR_DIMS.get_or_init(|| {
        match xcap::Monitor::all() {
            Ok(monitors) => {
                if let Some(monitor) = monitors.first() {
                    let x = monitor.x().unwrap_or(0);
                    let y = monitor.y().unwrap_or(0);
                    let w = monitor.width().unwrap_or(1920) as i32;
                    let h = monitor.height().unwrap_or(1080) as i32;
                    (x, y, w, h)
                } else {
                    (0, 0, 1920, 1080)
                }
            }
            Err(_) => (0, 0, 1920, 1080)
        }
    })
}

/// Greet command example - can be removed or extended
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to IT Support Center.", name)
}

/// Show the main application window with proper floating behavior
#[tauri::command]
fn show_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        if let Some(floating_icon) = app.get_webview_window("floating-icon") {
            position_window_near_icon(&window, &floating_icon);
        }
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
    }
}

/// Hide the main application window (minimize to tray)
#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

/// Toggle the main application window visibility
#[tauri::command]
fn toggle_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
        } else {
            if window.is_minimized().unwrap_or(false) {
                let _ = window.unminimize();
            }
            if let Some(floating_icon) = app.get_webview_window("floating-icon") {
                position_window_near_icon(&window, &floating_icon);
            }
            let _ = window.show();
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();
        }
    }
}

/// Quit the application completely
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
/// Handle clean shutdown with user sign-out
#[tauri::command]
async fn handle_shutdown(app: AppHandle) -> Result<(), String> {
  tokio::time::sleep(std::time::Duration::from_millis(500)).await;
  app.exit(0);
  Ok(())
}

// ============================================================================
// PHASE 8: Silent Desktop Upgrade Commands
// ============================================================================

/// Trusted hosts for installer downloads
/// SECURITY: Only allow downloads from these hosts to prevent arbitrary code execution
const TRUSTED_DOWNLOAD_HOSTS: &[&str] = &[
    "supportcenter.andalusiagroup.net",
    // Add localhost for development only if needed
    // "localhost",
];

/// Validate that a URL is from a trusted host
/// SECURITY: Prevents arbitrary file download attacks
fn is_trusted_download_url(url: &str) -> bool {
    match url::Url::parse(url) {
        Ok(parsed) => {
            if let Some(host) = parsed.host_str() {
                // Check if host matches any trusted host
                let host_lower = host.to_lowercase();
                TRUSTED_DOWNLOAD_HOSTS.iter().any(|&trusted| {
                    host_lower == trusted.to_lowercase()
                })
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

/// Download installer from URL to temporary directory
/// Returns the path to the downloaded file
/// SECURITY: Only allows downloads from trusted hosts (supportcenter.andalusiagroup.net)
#[tauri::command]
async fn download_installer(url: String, target_version: String) -> Result<String, String> {
    use tokio::io::AsyncWriteExt;
    use std::path::PathBuf;

    eprintln!("[update] Starting download from: {}", url);
    eprintln!("[update] Target version: {}", target_version);

    // SECURITY: Validate URL is from a trusted host
    if !is_trusted_download_url(&url) {
        eprintln!("[update] SECURITY: Rejected download from untrusted host: {}", url);
        return Err(format!(
            "Security error: Downloads only allowed from trusted hosts: {:?}",
            TRUSTED_DOWNLOAD_HOSTS
        ));
    }

    // Create temp directory for downloads
    let temp_dir = std::env::temp_dir();
    let filename = format!("it-support-center-{}-setup.exe", target_version);
    let download_path: PathBuf = temp_dir.join(&filename);

    eprintln!("[update] Download path: {:?}", download_path);

    // Download the file using reqwest (blocking for simplicity)
    // Note: For production, consider using async download with progress
    let response = reqwest::get(&url).await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    if bytes.is_empty() {
        return Err("Downloaded file is empty".to_string());
    }

    eprintln!("[update] Downloaded {} bytes", bytes.len());

    // Write to temp file
    let mut file = tokio::fs::File::create(&download_path).await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    file.write_all(&bytes).await
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    file.sync_all().await
        .map_err(|e| format!("Failed to sync file: {}", e))?;

    // Verify file exists and has content
    let metadata = tokio::fs::metadata(&download_path).await
        .map_err(|e| format!("Failed to verify downloaded file: {}", e))?;

    if metadata.len() == 0 {
        return Err("Downloaded file is empty after write".to_string());
    }

    eprintln!("[update] Successfully downloaded {} bytes to {:?}", metadata.len(), download_path);

    Ok(download_path.to_string_lossy().to_string())
}

/// Execute the NSIS installer silently and exit the app
/// This spawns the installer and then exits - the installer will continue after app closes
#[tauri::command]
async fn execute_installer_and_exit(
    app: AppHandle,
    installer_path: String,
    silent_args: String,
) -> Result<(), String> {
    use std::process::Command;

    eprintln!("[update] Preparing to execute installer: {}", installer_path);
    eprintln!("[update] Silent args: {}", silent_args);

    // Verify installer file exists
    if !std::path::Path::new(&installer_path).exists() {
        return Err(format!("Installer file not found: {}", installer_path));
    }

    // Parse silent args into individual arguments
    let args: Vec<&str> = silent_args.split_whitespace().collect();

    // Execute NSIS installer directly
    // NSIS uses /S for silent mode
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new(&installer_path);
        for arg in &args {
            cmd.arg(arg);
        }

        eprintln!("[update] Spawning installer: {} {}", installer_path, silent_args);

        // Spawn the installer (detached, won't block)
        match cmd.spawn() {
            Ok(_) => {
                eprintln!("[update] Installer spawned successfully");
            }
            Err(e) => {
                return Err(format!("Failed to spawn installer: {}", e));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // NSIS installation not supported on this platform
        eprintln!("[update] NSIS installation not supported on this platform");
        return Err("NSIS installation is only supported on Windows".to_string());
    }

    // Brief delay to ensure installer process starts
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    eprintln!("[update] Exiting app for update...");

    // Exit the app - installer will continue running
    app.exit(0);
    Ok(())
}

/// Check if running with admin privileges (Windows only)
/// Returns true if elevated, false otherwise
///
/// SECURITY (Finding #41 - Shell Command Safety):
/// This function uses `net session` command to check admin privileges.
/// - Command string is hardcoded ("net" with args ["session"]) - NO USER INPUT
/// - No string interpolation or dynamic command construction
/// - Output is only used to check exit status, not parsed for data
///
/// TODO (Future enhancement): Consider replacing with Windows API call:
/// `IsUserAnAdmin()` from shell32.dll for native privilege check
#[tauri::command]
fn is_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // SECURITY: Hardcoded command - no user input involved
        // Uses `net session` which fails if not running as admin
        match Command::new("net").args(["session"]).output() {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, check if running as root
        unsafe { libc::getuid() == 0 }
    }
}

/// Get the current app version
#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

// ============================================================================
// END PHASE 8 Commands
// ============================================================================

/// Get the current Windows/system username for SSO authentication
/// This retrieves the username from the operating system using reliable methods
///
/// Returns:
/// - On Windows: Uses whoami command or USERNAME env var
/// - On Unix/Linux: Uses whoami command or USER env var
/// - Fallback: "unknown" if neither is available
///
/// SECURITY (Finding #41 - Shell Command Safety):
/// This function uses the `whoami` command to retrieve the current username.
/// - Command string is hardcoded ("whoami") - NO USER INPUT
/// - No arguments passed - command string is completely static
/// - Output is only used for username extraction, validated for non-empty
/// - Fallback to environment variables if command fails
///
/// TODO (Future enhancement): Consider replacing with Windows API call:
/// `GetUserNameW()` from advapi32.dll for native username retrieval
#[tauri::command]
fn get_system_username() -> Result<String, String> {
    // SECURITY: Hardcoded command - no user input involved
    // First try whoami command (most reliable)
    let username = match std::process::Command::new("whoami")
        .output() {
        Ok(output) => {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !name.is_empty() {
                name
            } else {
                // Fallback to environment variables if whoami returns empty
                env::var("USERNAME")
                    .or_else(|_| env::var("USER"))
                    .map_err(|_| "Could not determine system username".to_string())?
            }
        }
        Err(_) => {
            // Fallback to environment variables if whoami fails
            env::var("USERNAME")
                .or_else(|_| env::var("USER"))
                .map_err(|_| "Could not determine system username".to_string())?
        }
    };

    if username.is_empty() {
        return Err("System username is empty".to_string());
    }

    // Remove domain prefix if present (e.g., "DOMAIN\\user" -> "user")
    let username = if username.contains('\\') {
        username.split('\\').last().unwrap_or(&username).to_string()
    } else if username.contains('@') {
        username.split('@').next().unwrap_or(&username).to_string()
    } else {
        username
    };

    Ok(username)
}

/// Get the computer name for device identification
/// This is useful for tracking which device is making requests
///
/// SECURITY (Finding #41 - Shell Command Safety):
/// This function uses the `hostname` command as a fallback.
/// - Command string is hardcoded ("hostname") - NO USER INPUT
/// - No arguments passed - command string is completely static
/// - Primary method uses environment variables (COMPUTERNAME/HOSTNAME)
/// - Shell command is only a fallback mechanism
///
/// TODO (Future enhancement): Consider replacing with Windows API call:
/// `GetComputerNameW()` from kernel32.dll for native hostname retrieval
#[tauri::command]
fn get_computer_name() -> Result<String, String> {
    // Try Windows COMPUTERNAME first, then Unix HOSTNAME
    let computer_name = env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .or_else(|_| {
            // SECURITY: Hardcoded command - no user input involved
            // Fallback to hostname command on Unix
            std::process::Command::new("hostname")
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .map_err(|e| e.to_string())
        })
        .map_err(|_| "Could not determine computer name".to_string())?;

    if computer_name.is_empty() {
        return Err("Computer name is empty".to_string());
    }

    Ok(computer_name)
}

/// Get OS information for device tracking
#[tauri::command]
fn get_os_info() -> String {
    let os = env::consts::OS;
    let arch = env::consts::ARCH;
    format!("{} ({})", os, arch)
}

/// Get local IP address for accurate session tracking
/// This retrieves the actual local IP address instead of relying on firewall/NAT IPs
///
/// SECURITY (Finding #41 - Shell Command Safety):
/// This function uses platform-specific commands to retrieve IP addresses.
/// - Windows: `ipconfig` (hardcoded, no arguments)
/// - Unix/Linux: `hostname -I` (hardcoded with static argument)
/// - All command strings are completely static - NO USER INPUT
/// - Output is parsed for IP addresses only, validated against known patterns
///
/// TODO (Future enhancement): Consider replacing with Windows API calls:
/// `GetAdaptersAddresses()` from iphlpapi.dll for native network info
#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    // Try to get local IP using platform-specific methods
    #[cfg(target_os = "windows")]
    {
        // SECURITY: Hardcoded command - no user input involved
        // On Windows, use ipconfig to get the local IP
        match std::process::Command::new("ipconfig")
            .output() {
            Ok(output) => {
                let output_str = String::from_utf8_lossy(&output.stdout);

                // Parse IPv4 addresses from ipconfig output
                // Look for lines like "   IPv4 Address. . . . . . . . . . . : 10.25.10.22"
                for line in output_str.lines() {
                    if line.contains("IPv4") && line.contains(":") {
                        if let Some(ip_part) = line.split(':').nth(1) {
                            let ip = ip_part.trim();
                            // Skip localhost
                            if !ip.starts_with("127.") && !ip.starts_with("169.254.") {
                                return Ok(ip.to_string());
                            }
                        }
                    }
                }

                Err("No valid local IP address found".to_string())
            }
            Err(e) => Err(format!("Failed to run ipconfig: {}", e))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix/Linux, use hostname -I or ip addr
        match std::process::Command::new("hostname")
            .arg("-I")
            .output() {
            Ok(output) => {
                let output_str = String::from_utf8_lossy(&output.stdout);
                let ips: Vec<&str> = output_str.split_whitespace().collect();

                // Return first non-localhost IP
                for ip in ips {
                    if !ip.starts_with("127.") && !ip.starts_with("169.254.") {
                        return Ok(ip.to_string());
                    }
                }

                Err("No valid local IP address found".to_string())
            }
            Err(_) => Err("Failed to get local IP".to_string())
        }
    }
}

/// Get server configuration unlock key from environment variable
/// This key is used to unlock server configuration settings in the login UI
#[tauri::command]
fn get_server_config_unlock_key() -> Result<String, String> {
    // Try multiple environment variable names
    let key = env::var("SERVER_CONFIG_UNLOCK_KEY")
        .or_else(|_| env::var("VITE_SERVER_CONFIG_UNLOCK_KEY"))
        .map_err(|_| {
            eprintln!("[get_server_config_unlock_key] Failed to read unlock key from environment");
            eprintln!("[get_server_config_unlock_key] Tried: SERVER_CONFIG_UNLOCK_KEY, VITE_SERVER_CONFIG_UNLOCK_KEY");
            eprintln!("[get_server_config_unlock_key] Available env vars: {:?}",
                env::vars().filter(|(k, _)| k.contains("SERVER") || k.contains("UNLOCK")).collect::<Vec<_>>());
            "Server configuration unlock key not found in environment".to_string()
        })?;

    eprintln!("[get_server_config_unlock_key] Successfully read unlock key (length: {})", key.len());
    Ok(key)
}

/// Capture desktop screenshot with instant, professional screen capture
/// Returns base64-encoded PNG image
#[tauri::command]
async fn capture_screen(app: AppHandle) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window.hide().map_err(|e| format!("Failed to hide window: {}", e))?;
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

    let capture_result = tokio::task::spawn_blocking(move || {
        let monitors = xcap::Monitor::all()
            .map_err(|e| format!("Failed to get monitors: {}", e))?;
        let monitor = monitors
            .into_iter()
            .next()
            .ok_or_else(|| "No monitors found".to_string())?;
        let image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;
        let mut png_buffer = Vec::new();
        image
            .write_to(&mut std::io::Cursor::new(&mut png_buffer), image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;
        Ok::<String, String>(general_purpose::STANDARD.encode(&png_buffer))
    })
    .await
    .map_err(|e| format!("Capture task failed: {}", e))?;

    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
    window.set_focus().ok();
    capture_result
}

/// Capture a specific region of the screen
#[tauri::command]
async fn capture_screen_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use image::GenericImageView;
        let monitors = xcap::Monitor::all()
            .map_err(|e| format!("Failed to get monitors: {}", e))?;
        let monitor = monitors
            .into_iter()
            .next()
            .ok_or_else(|| "No monitors found".to_string())?;
        let full_image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;
        let (img_width, img_height) = full_image.dimensions();
        let x = x.max(0) as u32;
        let y = y.max(0) as u32;
        let width = width.min(img_width.saturating_sub(x));
        let height = height.min(img_height.saturating_sub(y));
        if width == 0 || height == 0 {
            return Err("Invalid region dimensions".to_string());
        }
        let cropped = full_image.view(x, y, width, height).to_image();
        let mut png_buffer = Vec::new();
        cropped
            .write_to(&mut std::io::Cursor::new(&mut png_buffer), image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;
        Ok(general_purpose::STANDARD.encode(&png_buffer))
    })
    .await
    .map_err(|e| format!("Capture task failed: {}", e))?
}

/// Refresh monitor cache - call this if monitors are added/removed
#[tauri::command]
fn refresh_monitors() -> Result<String, String> {
    let monitors = xcap::Monitor::all()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;

    let monitor_info: Vec<serde_json::Value> = monitors
        .iter()
        .enumerate()
        .map(|(idx, m)| {
            // xcap 0.8.0: methods return Result, unwrap with defaults
            serde_json::json!({
                "id": idx,
                "name": m.name().unwrap_or_else(|_| format!("Monitor {}", idx)),
                "x": m.x().unwrap_or(0),
                "y": m.y().unwrap_or(0),
                "width": m.width().unwrap_or(1920),
                "height": m.height().unwrap_or(1080),
                "isPrimary": idx == 0,
            })
        })
        .collect();

    serde_json::to_string(&monitor_info)
        .map_err(|e| format!("Failed to serialize monitors: {}", e))
}

/// Get all available monitors with their properties
/// Returns JSON array of monitor information
#[tauri::command]
fn get_monitors() -> Result<String, String> {
    let monitors = xcap::Monitor::all()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;

    let monitor_info: Vec<serde_json::Value> = monitors
        .iter()
        .enumerate()
        .map(|(idx, m)| {
            // xcap 0.8.0: methods return Result, unwrap with defaults
            serde_json::json!({
                "id": idx,
                "name": m.name().unwrap_or_else(|_| format!("Monitor {}", idx)),
                "x": m.x().unwrap_or(0),
                "y": m.y().unwrap_or(0),
                "width": m.width().unwrap_or(1920),
                "height": m.height().unwrap_or(1080),
                "isPrimary": idx == 0,
            })
        })
        .collect();

    serde_json::to_string(&monitor_info)
        .map_err(|e| format!("Failed to serialize monitors: {}", e))
}

/// Get all visible windows with their properties
/// Returns JSON array of window information
#[cfg(target_os = "windows")]
#[tauri::command]
fn get_windows() -> Result<String, String> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowTextLengthW, IsWindowVisible,
        GetClassNameW, GetWindowThreadProcessId,
    };
    use std::sync::Mutex;

    // Store windows in a shared vec
    let windows: std::sync::Arc<Mutex<Vec<serde_json::Value>>> = std::sync::Arc::new(Mutex::new(Vec::new()));
    let windows_clone = windows.clone();

    // Callback for EnumWindows
    unsafe extern "system" fn enum_window_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let windows = &*(lparam.0 as *const Mutex<Vec<serde_json::Value>>);

        // Skip invisible windows
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1); // Continue enumeration
        }

        // Get window title
        let title_len = GetWindowTextLengthW(hwnd);
        if title_len == 0 {
            return BOOL(1); // Skip windows without title
        }

        let mut title_buf: Vec<u16> = vec![0; (title_len + 1) as usize];
        GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..title_len as usize]);

        // Skip empty titles
        if title.trim().is_empty() {
            return BOOL(1);
        }

        // Get class name (for filtering system windows)
        let mut class_buf: Vec<u16> = vec![0; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = if class_len > 0 {
            String::from_utf16_lossy(&class_buf[..class_len as usize])
        } else {
            String::new()
        };

        // Skip system/shell windows
        let skip_classes = [
            "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Progman",
            "WorkerW", "DV2ControlHost", "MssTaskListWClass",
            "MSTaskSwWClass", "Windows.UI.Core.CoreWindow",
        ];
        if skip_classes.iter().any(|&c| class_name.contains(c)) {
            return BOOL(1);
        }

        // Get process ID for app name lookup
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));

        // Add window to list
        if let Ok(mut list) = windows.lock() {
            let id = list.len();
            list.push(serde_json::json!({
                "id": id,
                "hwnd": hwnd.0 as i64,
                "title": title,
                "appName": class_name, // Use class name as app name for now
                "thumbnail": null
            }));
        }

        BOOL(1) // Continue enumeration
    }

    unsafe {
        let _ = EnumWindows(
            Some(enum_window_proc),
            LPARAM(std::sync::Arc::as_ptr(&windows_clone) as isize)
        );
    }

    let result = windows.lock().map_err(|e| format!("Lock error: {}", e))?;
    serde_json::to_string(&*result).map_err(|e| format!("Failed to serialize: {}", e))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn get_windows() -> Result<String, String> {
    // Return empty array on non-Windows platforms
    Ok("[]".to_string())
}

/// Capture a specific monitor by index
/// Returns base64-encoded JPEG image (smaller resolution for preview)
/// OPTIMIZED: Uses JPEG encoding for faster performance
#[tauri::command]
async fn capture_monitor_preview(monitor_id: usize) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use image::imageops::FilterType;
        use image::codecs::jpeg::JpegEncoder;

        let monitors = xcap::Monitor::all()
            .map_err(|e| format!("Failed to get monitors: {}", e))?;

        let monitor = monitors
            .get(monitor_id)
            .ok_or_else(|| format!("Monitor {} not found", monitor_id))?;

        let image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture monitor: {}", e))?;

        // Resize for preview (max 640px width, maintain aspect ratio)
        let (width, height) = (image.width(), image.height());
        let max_width = 640u32;
        let (new_width, new_height) = if width > max_width {
            let ratio = max_width as f32 / width as f32;
            (max_width, (height as f32 * ratio) as u32)
        } else {
            (width, height)
        };

        let resized = image::imageops::resize(&image, new_width, new_height, FilterType::Nearest);

        // Convert RGBA to RGB (JPEG doesn't support alpha channel)
        let rgb_image: image::RgbImage = image::DynamicImage::ImageRgba8(resized).to_rgb8();

        // Use JPEG for faster encoding (quality 75 for previews)
        let mut jpeg_buffer = Vec::with_capacity(100_000); // Pre-allocate ~100KB
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_buffer, 75);
        encoder.encode(
            rgb_image.as_raw(),
            new_width,
            new_height,
            image::ExtendedColorType::Rgb8
        ).map_err(|e| format!("Failed to encode JPEG: {}", e))?;

        Ok::<String, String>(general_purpose::STANDARD.encode(&jpeg_buffer))
    })
    .await
    .map_err(|e| format!("Capture task failed: {}", e))?
}

/// Capture a specific monitor at full resolution for streaming
/// Returns base64-encoded JPEG image optimized for real-time streaming
/// OPTIMIZED: fast_image_resize (SIMD) + jpeg-encoder (SIMD) for best quality/performance
#[tauri::command]
async fn capture_monitor_stream(monitor_id: usize) -> Result<String, String> {
    // Use spawn_blocking with increased priority for real-time performance
    tokio::task::spawn_blocking(move || {
        use fast_image_resize::{images::Image, Resizer, ResizeOptions, ResizeAlg, FilterType};
        use std::time::Instant;

        let t0 = Instant::now();

        // Get monitor (cached operation, ~0ms)
        let monitors = xcap::Monitor::all()
            .map_err(|e| format!("Failed to get monitors: {}", e))?;

        let t1 = Instant::now();

        let monitor = monitors
            .get(monitor_id)
            .ok_or_else(|| format!("Monitor {} not found", monitor_id))?;

        // Capture screen (bottleneck ~120-140ms)
        let captured = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture monitor: {}", e))?;

        let t2 = Instant::now();

        // Source dimensions
        let src_width = captured.width();
        let src_height = captured.height();

        // Target 960x540 for balanced quality/performance
        let dst_width = 960u32;
        let dst_height = 540u32;

        // Create source image from captured RGBA data
        let src_image = Image::from_vec_u8(
            src_width,
            src_height,
            captured.into_raw(),
            fast_image_resize::PixelType::U8x4,
        ).map_err(|e| format!("Failed to create source image: {}", e))?;

        // Create destination image
        let mut dst_image = Image::new(
            dst_width,
            dst_height,
            fast_image_resize::PixelType::U8x4,
        );

        // Resize using Lanczos3 (high quality, sharp for text/icons)
        let mut resizer = Resizer::new();
        resizer.resize(
            &src_image,
            &mut dst_image,
            &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3)),
        ).map_err(|e| format!("Failed to resize: {}", e))?;

        let t3 = Instant::now();

        // Convert RGBA to RGB for JPEG
        let rgba_data = dst_image.into_vec();
        let mut rgb_data = Vec::with_capacity((dst_width * dst_height * 3) as usize);
        for chunk in rgba_data.chunks(4) {
            rgb_data.push(chunk[0]); // R
            rgb_data.push(chunk[1]); // G
            rgb_data.push(chunk[2]); // B
        }

        // Use jpeg-encoder with SIMD (quality 90 for good balance of quality/speed)
        let mut jpeg_buffer = Vec::with_capacity(300_000);
        let encoder = jpeg_encoder::Encoder::new(&mut jpeg_buffer, 90);
        encoder.encode(
            &rgb_data,
            dst_width as u16,
            dst_height as u16,
            jpeg_encoder::ColorType::Rgb,
        ).map_err(|e| format!("Failed to encode JPEG: {}", e))?;

        let jpeg_data = jpeg_buffer;

        let t4 = Instant::now();

        // Log timing breakdown (only occasionally)
        static FRAME_COUNT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let frame_num = FRAME_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if frame_num % 30 == 0 {
            eprintln!(
                "[capture_monitor_stream] Frame {}: Monitor::all={:?}ms, capture={:?}ms, resize={:?}ms, encode={:?}ms, total={:?}ms",
                frame_num,
                t1.duration_since(t0).as_millis(),
                t2.duration_since(t1).as_millis(),
                t3.duration_since(t2).as_millis(),
                t4.duration_since(t3).as_millis(),
                t4.duration_since(t0).as_millis()
            );
        }

        Ok::<String, String>(general_purpose::STANDARD.encode(&jpeg_data))
    })
    .await
    .map_err(|e| format!("Capture task failed: {}", e))?
}

/// Capture a specific monitor at EXTREME resolution for local network streaming
/// Returns base64-encoded JPEG image at 1920x1080 with quality 97 for best visual fidelity
/// Use this profile for local network connections where bandwidth is not a concern
#[tauri::command]
async fn capture_monitor_stream_extreme(monitor_id: usize) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use fast_image_resize::{images::Image, Resizer, ResizeOptions, ResizeAlg, FilterType};
        use std::time::Instant;

        let t0 = Instant::now();

        let monitors = xcap::Monitor::all()
            .map_err(|e| format!("Failed to get monitors: {}", e))?;

        let t1 = Instant::now();

        let monitor = monitors
            .get(monitor_id)
            .ok_or_else(|| format!("Monitor {} not found", monitor_id))?;

        let captured = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture monitor: {}", e))?;

        let t2 = Instant::now();

        let src_width = captured.width();
        let src_height = captured.height();

        // EXTREME: Target 1920x1080 for maximum quality on local network
        let dst_width = 1920u32;
        let dst_height = 1080u32;

        // Create source image from captured RGBA data
        let src_image = Image::from_vec_u8(
            src_width,
            src_height,
            captured.into_raw(),
            fast_image_resize::PixelType::U8x4,
        ).map_err(|e| format!("Failed to create source image: {}", e))?;

        // Create destination image
        let mut dst_image = Image::new(
            dst_width,
            dst_height,
            fast_image_resize::PixelType::U8x4,
        );

        // Resize using Lanczos3 (high quality, sharp for text/icons)
        let mut resizer = Resizer::new();
        resizer.resize(
            &src_image,
            &mut dst_image,
            &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Lanczos3)),
        ).map_err(|e| format!("Failed to resize: {}", e))?;

        let t3 = Instant::now();

        // Convert RGBA to RGB for JPEG
        let rgba_data = dst_image.into_vec();
        let mut rgb_data = Vec::with_capacity((dst_width * dst_height * 3) as usize);
        for chunk in rgba_data.chunks(4) {
            rgb_data.push(chunk[0]); // R
            rgb_data.push(chunk[1]); // G
            rgb_data.push(chunk[2]); // B
        }

        // EXTREME: Use quality 92 for excellent quality with better performance
        let mut jpeg_buffer = Vec::with_capacity(800_000); // Larger buffer for 1080p
        let encoder = jpeg_encoder::Encoder::new(&mut jpeg_buffer, 92);
        encoder.encode(
            &rgb_data,
            dst_width as u16,
            dst_height as u16,
            jpeg_encoder::ColorType::Rgb,
        ).map_err(|e| format!("Failed to encode JPEG: {}", e))?;

        let jpeg_data = jpeg_buffer;

        let t4 = Instant::now();

        // Log timing breakdown (only occasionally)
        static FRAME_COUNT_EXTREME: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let frame_num = FRAME_COUNT_EXTREME.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if frame_num % 30 == 0 {
            eprintln!(
                "[capture_monitor_stream_extreme] Frame {}: Monitor::all={:?}ms, capture={:?}ms, resize={:?}ms, encode={:?}ms, total={:?}ms, size={}KB",
                frame_num,
                t1.duration_since(t0).as_millis(),
                t2.duration_since(t1).as_millis(),
                t3.duration_since(t2).as_millis(),
                t4.duration_since(t3).as_millis(),
                t4.duration_since(t0).as_millis(),
                jpeg_data.len() / 1024
            );
        }

        Ok::<String, String>(general_purpose::STANDARD.encode(&jpeg_data))
    })
    .await
    .map_err(|e| format!("Capture task failed: {}", e))?
}

/// Show a system notification with click-to-open functionality (Windows)
/// Uses tauri-winrt-notification for native Windows toast notifications with action callbacks
#[cfg(target_os = "windows")]
#[tauri::command]
async fn show_system_notification(
    app: AppHandle,
    title: String,
    body: String,
    _notification_type: Option<String>,
    ticket_id: Option<String>,
) -> Result<(), String> {
    use tauri_winrt_notification::Toast;

    let app_handle = app.clone();
    let ticket_id_clone = ticket_id.clone();

    // Truncate body to 50 characters for cleaner notification
    let truncated_body = if body.chars().count() > 50 {
        format!("{}...", body.chars().take(47).collect::<String>())
    } else {
        body
    };

    Toast::new("supportcenter.requester")
        .title(&title)
        .text1(&truncated_body)
        .on_activated(move |_action| {
            // Emit navigation event when notification is clicked
            if let Some(ref tid) = ticket_id_clone {
                let _ = app_handle.emit("navigate-to-chat", tid.clone());

                // Show and focus the main window
                if let Some(window) = app_handle.get_webview_window("main") {
                    // Unminimize if minimized
                    if window.is_minimized().unwrap_or(false) {
                        let _ = window.unminimize();
                    }
                    // Ensure window is visible
                    let _ = window.show();
                    // Temporarily set always on top to bring to front, then reset
                    let _ = window.set_always_on_top(true);
                    let _ = window.set_focus();
                    // Reset always_on_top after a short delay to avoid persistent top behavior
                    let _ = window.set_always_on_top(false);
                }
            }
            Ok(())
        })
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))
}

/// Show a system notification using the Tauri notification plugin (non-Windows fallback)
#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn show_system_notification(
    app: AppHandle,
    title: String,
    body: String,
    _notification_type: Option<String>,
    _ticket_id: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    // Truncate body to 50 characters for cleaner notification
    let truncated_body = if body.chars().count() > 50 {
        format!("{}...", body.chars().take(47).collect::<String>())
    } else {
        body
    };

    app.notification()
        .builder()
        .title(title)
        .body(truncated_body)
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))
}

/// Check if the main window is currently focused
#[tauri::command]
fn is_window_focused(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_focused = window.is_focused().map_err(|e| format!("{}", e))?;
        let is_visible = window.is_visible().map_err(|e| format!("{}", e))?;
        Ok(is_focused && is_visible)
    } else {
        Err("Main window not found".to_string())
    }
}

/// Update unread message count on floating icon
#[tauri::command]
fn update_floating_icon_unread_count(app: AppHandle, count: u32) -> Result<(), String> {
    if let Some(floating_icon) = app.get_webview_window("floating-icon") {
        floating_icon.emit("update-unread-count", serde_json::json!({ "count": count }))
            .map_err(|e| format!("Failed to emit event: {}", e))
    } else {
        Err("Floating icon window not found".to_string())
    }
}

/// Trigger red flash on floating icon for new message notification
#[tauri::command]
fn trigger_floating_icon_flash(app: AppHandle, count: Option<u32>) -> Result<(), String> {
    if let Some(floating_icon) = app.get_webview_window("floating-icon") {
        let payload = match count {
            Some(c) => serde_json::json!({ "count": c }),
            None => serde_json::json!({}),
        };
        floating_icon.emit("new-message-flash", payload)
            .map_err(|e| format!("Failed to emit event: {}", e))
    } else {
        Err("Floating icon window not found".to_string())
    }
}


/// Setup global notification event listener
fn setup_notification_listener(app: &AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    let app_handle = app.clone();

    let _ = app.listen("show-notification", move |event| {
        let payload = event.payload();
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(payload) {
            let title = data.get("title").and_then(|v| v.as_str()).unwrap_or("Notification").to_string();
            let body = data.get("body").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let _ = app_handle.notification().builder().title(title).body(body).show();
        }
    });
}



/// Setup floating icon window behavior
fn setup_floating_icon(app: &AppHandle) {
    let app_handle = app.clone();

    let _ = app.listen("floating-icon-click", move |_event| {
        if let Some(main_window) = app_handle.get_webview_window("main") {
            let is_visible = main_window.is_visible().unwrap_or(false);
            let is_focused = main_window.is_focused().unwrap_or(false);

            if is_visible && is_focused {
                let _ = main_window.hide();
            } else {
                if main_window.is_minimized().unwrap_or(false) {
                    let _ = main_window.unminimize();
                }
                if let Some(floating_icon) = app_handle.get_webview_window("floating-icon") {
                    position_window_near_icon(&main_window, &floating_icon);
                }
                let _ = main_window.show();
                let _ = main_window.set_always_on_top(true);
                let _ = main_window.set_focus();
            }
        }
    });
}

/// Position main window near floating icon (above if space, otherwise below)
fn position_window_near_icon(main_window: &tauri::WebviewWindow, floating_icon: &tauri::WebviewWindow) {
    let (_mx, _my, screen_width, screen_height) = get_primary_monitor_dims();

    let (icon_x, icon_y, icon_width, icon_height) = match (floating_icon.outer_position(), floating_icon.outer_size()) {
        (Ok(pos), Ok(size)) => (pos.x, pos.y, size.width as i32, size.height as i32),
        _ => {
            // Fallback positioning (bottom-right corner, above taskbar)
            let margin = 20;
            let taskbar_offset = 50;
            (screen_width - 48 - margin, screen_height - 48 - margin - taskbar_offset, 48, 48)
        }
    };

    position_window_with_known_icon_pos(main_window, icon_x, icon_y, icon_width, icon_height, screen_width, screen_height);
}

/// Helper function to position window given known icon position and screen dimensions
/// Positions main window above the floating icon (which is at bottom-right)
fn position_window_with_known_icon_pos(
    main_window: &tauri::WebviewWindow,
    mut icon_x: i32,
    mut icon_y: i32,
    icon_width: i32,
    _icon_height: i32,
    screen_width: i32,
    screen_height: i32,
) {
    let window_size = match main_window.outer_size() {
        Ok(size) => size,
        _ => return,
    };
    let window_width = window_size.width as i32;
    let window_height = window_size.height as i32;

    // Fix uninitialized icon position (bottom-right corner, above taskbar)
    if (icon_x < 100 && icon_y < 100) || (icon_x == 0 && icon_y == 0) {
        let margin = 20;
        let taskbar_offset = 50;
        icon_x = screen_width - icon_width - margin;
        icon_y = screen_height - icon_width - margin - taskbar_offset;
    }

    let vertical_gap = 20;

    // Position window above icon (since icon is at bottom-right)
    // Ensure window stays within screen bounds
    let window_y = (icon_y - window_height - vertical_gap).max(10);

    // Position horizontally near icon (aligned to right edge)
    let horizontal_offset = 20;
    let icon_right_edge = icon_x + icon_width;
    let window_x = if icon_right_edge < window_width {
        10
    } else {
        (icon_right_edge - window_width - horizontal_offset).max(10).min(screen_width - window_width - 10)
    };

    let _ = main_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: window_x,
        y: window_y,
    }));
}

// ============================================================================
// Remote Input Injection Commands
// ============================================================================

/// Inject mouse move event at normalized coordinates (0.0-1.0)
/// Normalized coords from agent are mapped to actual screen position.
/// Uses GetSystemMetrics-based dimensions for accurate Windows input mapping.
#[tauri::command]
fn remote_mouse_move(x: f64, y: f64) -> Result<(), String> {
    // Use GetSystemMetrics-based dimensions for accurate mouse positioning
    let (width, height) = get_screen_dims_for_mouse();
    let screen_x = (x * width as f64) as i32;
    let screen_y = (y * height as f64) as i32;
    // Use optimized version that takes pre-cached dimensions
    remote_input::inject_mouse_move_with_dims(screen_x, screen_y, width, height)
}

/// Inject mouse button down event
#[tauri::command]
fn remote_mouse_down(button: u32) -> Result<(), String> {
    remote_input::inject_mouse_down(button)
}

/// Inject mouse button up event
#[tauri::command]
fn remote_mouse_up(button: u32) -> Result<(), String> {
    remote_input::inject_mouse_up(button)
}

/// Inject mouse click at normalized coordinates (0.0-1.0)
/// Normalized coords from agent are mapped to actual screen position.
#[tauri::command]
fn remote_mouse_click(x: f64, y: f64, button: u32) -> Result<(), String> {
    // Use GetSystemMetrics-based dimensions for accurate mouse positioning
    let (width, height) = get_screen_dims_for_mouse();
    let screen_x = (x * width as f64) as i32;
    let screen_y = (y * height as f64) as i32;
    // Use optimized version that takes pre-cached dimensions
    remote_input::inject_mouse_click_with_dims(screen_x, screen_y, button, width, height)
}

/// Inject mouse wheel scroll
#[tauri::command]
fn remote_mouse_wheel(delta: i32) -> Result<(), String> {
    remote_input::inject_mouse_wheel(delta)
}

/// Inject keyboard key down event
#[tauri::command]
fn remote_key_down(code: String, ctrl: bool, shift: bool, alt: bool) -> Result<(), String> {
    remote_input::inject_key_down(&code, ctrl, shift, alt)
}

/// Inject keyboard key up event
#[tauri::command]
fn remote_key_up(code: String, ctrl: bool, shift: bool, alt: bool) -> Result<(), String> {
    remote_input::inject_key_up(&code, ctrl, shift, alt)
}

// ============================================================================
// UAC Detection Commands
// ============================================================================

/// Start UAC detection and emit events when UAC state changes
#[tauri::command]
async fn start_uac_detection(app: AppHandle) -> Result<(), String> {
    let detector = uac_detector::UACDetector::new();

    detector.start(move |is_active| {
        let event_type = if is_active { "uac_detected" } else { "uac_dismissed" };
        let _ = app.emit(event_type, ());
    }).await;

    Ok(())
}

/// Check if UAC is currently active (one-time check)
#[tauri::command]
fn is_uac_active() -> Result<bool, String> {
    // Create a temporary detector to check current state
    let detector = uac_detector::UACDetector::new();
    Ok(detector.is_active())
}

// ============================================================================
// AUTO-START COMMANDS (Windows Registry-based)
// ============================================================================

/// Check current auto-start status
/// Returns detailed status including whether enabled, entry exists, and any mismatches
#[tauri::command]
fn check_autostart_status() -> Result<autostart::AutostartStatus, String> {
    autostart::check_autostart_status()
}

/// Enable auto-start on Windows login
///
/// Follows strict idempotency rules:
/// - If entry exists with correct value → do nothing, return success
/// - If entry missing → create it
/// - If entry exists with different value → log warning, DO NOT overwrite
///
/// Returns detailed result including whether entry was newly created
#[tauri::command]
fn enable_autostart() -> Result<autostart::AutostartEnableResult, String> {
    autostart::enable_autostart()
}

/// Disable auto-start (remove registry entry)
#[tauri::command]
fn disable_autostart() -> Result<autostart::AutostartEnableResult, String> {
    autostart::disable_autostart()
}

/// Mark profile setup as complete and enable auto-start
///
/// This is the primary entry point for enabling auto-start after user completes profile setup.
/// It persists the profile_setup_completed flag and enables auto-start if not already configured.
///
/// Safe to call multiple times (idempotent).
#[tauri::command]
fn mark_profile_setup_complete(app: AppHandle) -> Result<autostart::AutostartEnableResult, String> {
    eprintln!("[autostart] mark_profile_setup_complete called");

    // Check if already configured to avoid redundant operations
    let already_configured = storage::get_value(&app, storage::KEY_AUTOSTART_CONFIGURED)
        .ok()
        .flatten()
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if already_configured {
        eprintln!("[autostart] Auto-start already configured, checking status...");
        let status = autostart::check_autostart_status()?;
        return Ok(autostart::AutostartEnableResult {
            success: status.enabled,
            enabled: status.enabled,
            message: if status.enabled {
                "Auto-start already configured and enabled".to_string()
            } else {
                status.message
            },
            was_created: false,
        });
    }

    // Mark profile setup as complete
    if let Err(e) = storage::set_value(&app, storage::KEY_PROFILE_SETUP_COMPLETED, serde_json::Value::Bool(true)) {
        eprintln!("[autostart] Warning: Failed to persist profile_setup_completed flag: {}", e);
        // Continue anyway - this is non-critical
    }

    // Enable auto-start (Windows only, stub on other platforms)
    let result = autostart::enable_autostart()?;

    // If successful, mark as configured to avoid redundant registry operations
    if result.success {
        if let Err(e) = storage::set_value(&app, storage::KEY_AUTOSTART_CONFIGURED, serde_json::Value::Bool(true)) {
            eprintln!("[autostart] Warning: Failed to persist autostart_configured flag: {}", e);
            // Continue anyway - worst case we'll try again next launch
        }
    }

    Ok(result)
}

/// Check if profile setup has been completed
#[tauri::command]
fn is_profile_setup_complete(app: AppHandle) -> Result<bool, String> {
    let completed = storage::get_value(&app, storage::KEY_PROFILE_SETUP_COMPLETED)
        .ok()
        .flatten()
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Ok(completed)
}

// ============================================================================
// STORAGE COMMANDS
// ============================================================================

/// Get a value from persistent storage (generic - excludes auth keys)
///
/// Auth-related keys (access_token, user, session_id) are protected.
/// Use auth-specific commands to access them.
#[tauri::command]
fn storage_get(app: AppHandle, key: String) -> Result<Option<serde_json::Value>, String> {
    // Validate key is not a protected auth key
    storage::validate_key(&key)?;

    storage::get_value(&app, &key)
}

/// Set a value in persistent storage (generic - excludes auth keys)
///
/// Auth-related keys (access_token, user, session_id) are protected.
/// Use auth-specific commands to access them.
#[tauri::command]
fn storage_set(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    // Validate key is not a protected auth key
    storage::validate_key(&key)?;

    storage::set_value(&app, &key, value)
}

/// Delete a value from persistent storage (generic - excludes auth keys)
#[tauri::command]
fn storage_delete(app: AppHandle, key: String) -> Result<(), String> {
    // Validate key is not a protected auth key
    storage::validate_key(&key)?;

    storage::delete_value(&app, &key)
}

/// Check if a key exists in persistent storage
#[tauri::command]
fn storage_has(app: AppHandle, key: String) -> Result<bool, String> {
    storage::has_key(&app, &key)
}

/// Migrate data from localStorage to Tauri Store (one-time operation)
#[tauri::command]
fn storage_migrate_from_local(app: AppHandle, data: serde_json::Value) -> Result<(), String> {
    storage::migrate_from_local_storage(&app, data)
}

// Auth-specific storage commands with key allowlist validation (Finding #42)

/// Get auth data from storage (auth-store only)
///
/// SECURITY (Finding #42): Only keys in ALLOWED_AUTH_KEYS can be accessed.
/// This prevents arbitrary storage enumeration through auth commands.
#[tauri::command]
fn auth_storage_get(app: AppHandle, key: String) -> Result<Option<serde_json::Value>, String> {
    // SECURITY: Validate key is in the auth allowlist
    storage::validate_auth_key(&key)?;
    storage::get_value(&app, &key)
}

/// Set auth data in storage (auth-store only)
///
/// SECURITY (Finding #42): Only keys in ALLOWED_AUTH_KEYS can be written.
/// This prevents arbitrary data injection through auth commands.
#[tauri::command]
fn auth_storage_set(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    // SECURITY: Validate key is in the auth allowlist
    storage::validate_auth_key(&key)?;
    storage::set_value(&app, &key, value)
}

/// Delete auth data from storage (auth-store only)
///
/// SECURITY (Finding #42): Only keys in ALLOWED_AUTH_KEYS can be deleted.
/// This prevents arbitrary data destruction through auth commands.
#[tauri::command]
fn auth_storage_delete(app: AppHandle, key: String) -> Result<(), String> {
    // SECURITY: Validate key is in the auth allowlist
    storage::validate_auth_key(&key)?;
    storage::delete_value(&app, &key)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file - try multiple locations
    println!("[Tauri] Loading .env file...");

    // Try different paths where .env might be located
    let env_loaded = dotenvy::dotenv().is_ok()
        || dotenvy::from_filename("../.env").is_ok()
        || dotenvy::from_filename("../../.env").is_ok()
        || dotenvy::from_filename("../src/.env").is_ok();

    if env_loaded {
        println!("[Tauri] ✅ .env file loaded successfully");
        println!("[Tauri] SERVER_CONFIG_UNLOCK_KEY present: {}",
            env::var("SERVER_CONFIG_UNLOCK_KEY").is_ok());
    } else {
        eprintln!("[Tauri] ⚠️  Warning: Could not load .env file from any location");
        eprintln!("[Tauri] Searched: .env, ../.env, ../../.env, ../src/.env");
    }


    let builder = tauri::Builder::default()
        // Register the single-instance plugin (MUST be first to prevent duplicate launches)
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            // This callback runs in the EXISTING instance when a second instance is launched
            eprintln!("[Single Instance] Second instance detected");
            eprintln!("[Single Instance] Args: {:?}", args);
            eprintln!("[Single Instance] CWD: {:?}", cwd);

            // Emit event with arguments (for deep-link handling if needed)
            if !args.is_empty() {
                let _ = app.emit("second-instance-launched", serde_json::json!({
                    "args": args,
                    "cwd": cwd
                }));
            }

            // Bring the main window to the foreground
            if let Some(main_window) = app.get_webview_window("main") {
                // Restore if minimized
                if main_window.is_minimized().unwrap_or(false) {
                    let _ = main_window.unminimize();
                }

                // Show if hidden
                if !main_window.is_visible().unwrap_or(true) {
                    // Position window near icon before showing
                    if let Some(floating_icon) = app.get_webview_window("floating-icon") {
                        position_window_near_icon(&main_window, &floating_icon);
                    }
                    let _ = main_window.show();
                }

                // Bring to front and focus
                let _ = main_window.set_always_on_top(true);
                let _ = main_window.set_focus();

                eprintln!("[Single Instance] Main window focused");
            } else {
                eprintln!("[Single Instance] Warning: Main window not found");
            }
        }))
        // Register the store plugin for persistent storage
        .plugin(tauri_plugin_store::Builder::new().build())
        // Register the HTTP plugin for bypassing WebView2 CORS
        .plugin(tauri_plugin_http::init())
        // Register the notification plugin
        .plugin(tauri_plugin_notification::init())
        // Register the shell plugin for opening URLs
        .plugin(tauri_plugin_shell::init())
        // Register the autostart plugin for auto-launch on login
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        // Register commands
        .invoke_handler(tauri::generate_handler![
            greet,
            get_system_username,
            get_computer_name,
            get_os_info,
            get_local_ip,
            get_server_config_unlock_key,
            show_window,
            hide_window,
            toggle_window,
            quit_app,
            handle_shutdown,
            capture_screen,
            capture_screen_region,
            get_monitors,
            refresh_monitors,
            get_windows,
            capture_monitor_preview,
            capture_monitor_stream,
            capture_monitor_stream_extreme,
            show_system_notification,
            is_window_focused,
            update_floating_icon_unread_count,
            trigger_floating_icon_flash,
            remote_mouse_move,
            remote_mouse_down,
            remote_mouse_up,
            remote_mouse_click,
            remote_mouse_wheel,
            remote_key_down,
            remote_key_up,
            start_uac_detection,
            is_uac_active,
            // Auto-start commands
            check_autostart_status,
            enable_autostart,
            disable_autostart,
            mark_profile_setup_complete,
            is_profile_setup_complete,
            // Storage commands
            storage_get,
            storage_set,
            storage_delete,
            storage_has,
            storage_migrate_from_local,
            auth_storage_get,
            auth_storage_set,
            auth_storage_delete,
            // Phase 8: Silent upgrade commands
            download_installer,
            execute_installer_and_exit,
            is_elevated,
            get_app_version,
            // Session logging commands
            logging::log_write,
            logging::log_write_batch,
            logging::log_get_directory,
            logging::log_list_files,
            logging::log_read_file,
            logging::log_get_total_size,
            logging::log_force_rotate,
            logging::log_clear_all,
            logging::log_init
        ])
        // Handle window events - hide instead of close/minimize
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Resized(_size) => {
                    // On Windows, minimize triggers a resize event
                    // Check if window was minimized and convert to hide
                    if window.label() == "main" {
                        if window.is_minimized().unwrap_or(false) {
                            let _ = window.unminimize();
                            let _ = window.hide();
                        }
                    }
                }
                _ => {}
            }
        })
        // Setup floating icon functionality
        .setup(|app| {
            // Migrate app data from old directory to new location (if needed)
            println!("[App] Checking for app data migration...");
            match migration::migrate_app_data(&app.handle()) {
                Ok(result) => {
                    if result.migrated {
                        println!("[App] ✅ Migration completed: {}", result.reason);
                        println!("[App]    Files copied: {}", result.files_copied);
                        if let Some(old_path) = &result.old_path {
                            println!("[App]    Old path: {}", old_path);
                        }
                        if let Some(new_path) = &result.new_path {
                            println!("[App]    New path: {}", new_path);
                        }
                    } else {
                        println!("[App] Migration not needed: {}", result.reason);
                    }
                }
                Err(e) => {
                    eprintln!("[App] ⚠️  Warning: Migration failed: {}", e);
                    eprintln!("[App] App will continue, but data may need manual migration.");
                }
            }

            // Initialize persistent storage with defaults from .env
            println!("[App] Initializing persistent storage...");
            if let Err(e) = storage::init_store_with_defaults(&app.handle()) {
                eprintln!("[App] Warning: Failed to initialize storage: {}", e);
                eprintln!("[App] App will continue, but settings may not persist.");
            } else {
                println!("[App] Storage initialized successfully");
            }

            // Setup floating icon click listener
            setup_floating_icon(&app.handle());

            // Setup global notification event listener
            setup_notification_listener(&app.handle());

            // Show and position floating icon at bottom-right corner
            if let Some(floating_icon) = app.get_webview_window("floating-icon") {
                // Get scale factor for DPI scaling
                let scale_factor = floating_icon.scale_factor().unwrap_or(1.0);

                // Get primary monitor dimensions from cache
                let (_monitor_x, _monitor_y, screen_width, screen_height) = get_primary_monitor_dims();

                // Set icon size (48 logical pixels)
                let icon_size_logical = 48.0;
                let icon_size_physical = (icon_size_logical * scale_factor) as u32;
                let margin = 20;
                let taskbar_offset = 50; // Extra offset to avoid Windows taskbar

                // Force size by setting min and max to the same value
                let size = tauri::Size::Logical(tauri::LogicalSize {
                    width: icon_size_logical,
                    height: icon_size_logical,
                });
                let _ = floating_icon.set_min_size(Some(size.clone()));
                let _ = floating_icon.set_max_size(Some(size.clone()));
                let _ = floating_icon.set_size(size);

                // Position at bottom-right corner (above taskbar)
                let x_pos = screen_width - icon_size_physical as i32 - margin;
                let y_pos = screen_height - icon_size_physical as i32 - margin - taskbar_offset;

                let _ = floating_icon.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: x_pos,
                    y: y_pos
                }));
                let _ = floating_icon.show();
                let _ = floating_icon.set_always_on_top(true);

                // Reposition after window initializes (handles actual size on Linux)
                let floating_icon_clone = floating_icon.clone();
                let screen_width_clone = screen_width;
                let screen_height_clone = screen_height;
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    if let Ok(size) = floating_icon_clone.outer_size() {
                        let actual_width = size.width as i32;
                        let actual_height = size.height as i32;
                        let new_x = screen_width_clone - actual_width - margin;
                        let new_y = screen_height_clone - actual_height - margin - taskbar_offset;
                        let _ = floating_icon_clone.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                            x: new_x,
                            y: new_y
                        }));
                    }
                });
            }

            // Position the main window initially (visible on startup)
            if let Some(main_window) = app.get_webview_window("main") {
                if let Some(floating_icon) = app.get_webview_window("floating-icon") {
                    position_window_near_icon(&main_window, &floating_icon);
                }
                // Show and focus the window on startup
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }

            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
