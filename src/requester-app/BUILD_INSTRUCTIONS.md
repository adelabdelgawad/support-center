# Tauri Requester App - Windows Build Instructions

## ⚠️ IMPORTANT: Build on Windows Only

The Tauri requester app **MUST be built on a Windows machine** because:
- It's a Windows-only application (`.exe`)
- Uses Windows-specific APIs (ipconfig, COMPUTERNAME, etc.)
- Tauri requires the target OS for native compilation

## 📋 Prerequisites (Windows Machine)

1. **Install Node.js 18+**
   - Download from https://nodejs.org/
   - Verify: `node --version`

2. **Install Rust**
   - Download from https://rustup.rs/
   - Run: `rustup-init.exe`
   - Restart terminal after installation
   - Verify: `rustc --version`

3. **Install WebView2** (usually pre-installed on Windows 10/11)
   - Download from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
   - Install the "Evergreen Bootstrapper"

4. **Install Visual Studio Build Tools**
   - Download from: https://visualstudio.microsoft.com/downloads/
   - Select "Desktop development with C++"
   - Or install via: `npm install --global windows-build-tools`

## 🏗️ Build Steps

### 1. Clone/Transfer Source Code to Windows Machine

Transfer the entire `/home/supportcenter/it-app-sessions/src/requester-app/src` directory to your Windows machine.

### 2. Install Dependencies

```bash
cd requester-app/src
npm install
```

### 3. Build the Application

```bash
npm run tauri:build
```

This will:
- Build the Vite frontend
- Compile the Rust backend
- Create the Windows installer (.exe)
- Take 5-10 minutes on first build

### 4. Find the Built Installer

The installer will be at:
```
src-tauri\target\release\bundle\nsis\IT-Support-Center_1.0.0_x64-setup.exe
```

## 📦 What Gets Built

- **Setup Installer**: `IT-Support-Center_1.0.0_x64-setup.exe` (~15-20 MB)
  - Includes WebView2 bootstrapper
  - Auto-installs to Program Files
  - Creates desktop shortcut
  - Adds to Start Menu

- **Standalone .exe**: `src-tauri\target\release\it-support-center.exe`
  - Requires WebView2 pre-installed
  - Can be run directly without installer

## 🔧 Recent Changes (Fixed Issues)

### Issue 1: Infinite Loading on Invalid Session ✅ FIXED

**Problem**: When session expired, app showed "Session invalid" but kept loading infinitely.

**Root Cause**:
- WebSocket used `localStorage.removeItem()`
- Tauri app uses `AuthStorage` (plugin-store)
- Token wasn't actually cleared → infinite reconnect loop

**Fix Applied**:
- Updated `notification-websocket.ts` to use `AuthStorage.clearAll()`
- Updated `fetch-client.ts` to force reload after redirect
- Now properly clears session and redirects to login

### Issue 2: Wrong IP Address and Computer Name ✅ FIXED

**Problem**: Sessions stored firewall IP (10.25.205.1) instead of local IP (10.25.10.22)

**Root Cause**: App wasn't calling the Tauri commands to get local IP and computer name

**Fix Applied**:
- Tauri commands already exist (`get_local_ip`, `get_computer_name`)
- Frontend already calls them in `auth.ts`
- Need to **rebuild** app for changes to take effect

### Issue 3: Remote Access Not Working - SignalR Hub Mismatch ✅ FIXED

**Problem**: Remote access connection failed because Tauri app and web app connected to different SignalR hubs

**Root Cause**:
- Tauri app (on internal network 10.25.x.x) → Connected to `http://10.25.10.50/signalr` (internal hub)
- Web app (accessed via public URL) → Connected to `https://supportcenter.andalusiagroup.net/signalr` (public hub)
- SignalR messages couldn't route between the two different connection contexts
- WebRTC signaling failed → ICE connection timeout

**Fix Applied**:
- Updated `.env` file to use the **same public SignalR URL** for both internal and external network detection
- Both apps now connect to: `https://supportcenter.andalusiagroup.net/signalr`
- Tauri app uses public URL even when on internal network (10.25.x.x)
- This ensures both parties use the same SignalR hub for WebRTC signaling
- **Critical**: Must rebuild app for this change to take effect

### Windows-Specific Tauri Commands

All commands are Windows-compatible:

1. **`get_local_ip()`**
   - Uses `ipconfig` command
   - Parses IPv4 addresses
   - Skips localhost (127.x) and APIPA (169.254.x)

2. **`get_computer_name()`**
   - Uses `COMPUTERNAME` environment variable
   - Falls back to `hostname` command

3. **`get_system_username()`**
   - Uses `USERNAME` environment variable
   - For SSO auto-login

## 🚀 Deploy New Version

After building:

1. **Copy installer to shared location** or use deployment tool
2. **Inform users** to download and install new version
3. **Old sessions will be invalidated** after update (expected)

## 🧪 Test Checklist

After installing the new build, verify:

- [ ] SSO login works
- [ ] Computer name shows correctly (not "Unknown")
- [ ] IP address shows local IP (not firewall IP)
- [ ] Invalid session redirects to login properly (no infinite loop)
- [ ] Desktop notifications work
- [ ] Screenshot capture works
- [ ] System tray icon functions
- [ ] **Remote access works** - Connect to remote session and verify video/audio/screen sharing
- [ ] **SignalR connection** - Check browser console for `wss://supportcenter.andalusiagroup.net/signalr` (not `ws://10.25.10.50`)

## 🐛 Troubleshooting

### Build Fails: "Rust not found"
```bash
rustup-init.exe
# Restart terminal
rustc --version
```

### Build Fails: "MSVC not found"
- Install Visual Studio Build Tools
- Select "Desktop development with C++"

### Build Fails: "WebView2 not found"
- Download WebView2 Runtime Installer
- Install as administrator

### App Won't Start After Install
- Ensure WebView2 is installed
- Check antivirus isn't blocking it
- Run installer as administrator

## 📝 Version History

- **v1.0.0** - Current version with fixes:
  - Fixed infinite loading on invalid session
  - Fixed IP address tracking (now shows local IP)
  - Fixed computer name tracking (no more "Unknown")
  - **Fixed remote access** - Tauri app now uses public SignalR URL to match web app

## 🔗 Additional Resources

- Tauri Documentation: https://tauri.app/
- Rust Installation: https://rustup.rs/
- WebView2: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
