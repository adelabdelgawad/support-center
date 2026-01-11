# Tauri CORS Debug Guide

## Problem
Your Tauri app shows CORS errors but requests **are not appearing in nginx logs**.

## Evidence
✅ SignalR requests from 10.25.1.22 (your Windows machine) work via HTTPS
❌ API requests from Tauri app do NOT appear in nginx logs
✅ Server CORS configuration is correct (tested with curl - 200 OK)
❌ Your app is hitting a different server or using wrong URL

## Root Cause Analysis

### 1. Check What URL Your App Is Using

Open Tauri DevTools (F12 in the app) and check the **Network** tab:

**What to look for:**
```
Failed request URL should show one of these:

❌ http://supportcenter.andalusiagroup.net:8000/api/v1/...
   → App using OLD config with :8000 port
   → SOLUTION: Rebuild the app

❌ https://supportcenter.andalusiagroup.net/api/v1/...
   → App using HTTPS instead of HTTP
   → SOLUTION: Check .env file, ensure HTTP not HTTPS

✅ http://supportcenter.andalusiagroup.net/api/v1/...
   → Correct URL but still failing
   → SOLUTION: Check Windows hosts file or firewall
```

### 2. Check if App Needs Rebuild

Your `.env` file is correct:
```env
VITE_API_URL=http://supportcenter.andalusiagroup.net/api/v1
```

But Vite **embeds** environment variables at **build time**. If you changed `.env` after building, the running app still has the old values.

**How to rebuild:**
```bash
cd /home/arc-webapp-01/support_center/src/requester-app/src

# Clean and rebuild
rm -rf dist src-tauri/target
npm run tauri build

# Or run in dev mode for testing
npm run tauri dev
```

### 3. Check Windows Network Configuration

From your Windows machine, run these PowerShell commands:

```powershell
# Check DNS resolution
nslookup supportcenter.andalusiagroup.net
# Should show: 10.25.10.50 or 41.196.65.226

# Check hosts file for overrides
type C:\Windows\System32\drivers\etc\hosts | findstr supportcenter
# Should be empty (no output)

# Test HTTP connection to port 80
Test-NetConnection -ComputerName supportcenter.andalusiagroup.net -Port 80
# Should show: TcpTestSucceeded : True

# Test actual CORS preflight
curl.exe -X OPTIONS `
  -H "Origin: http://localhost:1420" `
  -H "Access-Control-Request-Method: GET" `
  -H "Access-Control-Request-Headers: Authorization" `
  http://supportcenter.andalusiagroup.net/api/v1/chat/all-tickets `
  -v
# Should show: HTTP/1.1 200 OK (NOT 301 or 405)
```

### 4. Check Tauri Console Logs

In Tauri DevTools Console, check the initialization logs:

```javascript
// Look for these log lines:
[RuntimeConfig] Initialized with: {apiUrl: "http://..."}
[network] Network mode detected {serverAddress: "http://..."}
```

**What the serverAddress should be:**
```
✅ http://supportcenter.andalusiagroup.net/api/v1
❌ http://supportcenter.andalusiagroup.net:8000/api/v1  (old, needs rebuild)
❌ https://supportcenter.andalusiagroup.net/api/v1  (wrong protocol)
```

## Server Configuration Status

✅ **All server-side configuration is correct:**

| Component | Status | Details |
|-----------|--------|---------|
| Nginx HTTP (port 80) | ✅ Working | API passthrough configured |
| Nginx HTTPS (port 443) | ✅ Working | SignalR working from your PC |
| Backend CORS | ✅ Working | Allows localhost:1420 |
| Header forwarding | ✅ Working | Authorization, etc. |

**Test results from server:**
```
HTTP port 80:  200 OK ✅
HTTPS port 443: 200 OK ✅
Direct backend: 200 OK ✅
```

## Next Steps

1. **FIRST**: Check Tauri DevTools Network tab - what URL is failing?

2. **SECOND**: Share the screenshot or copy the exact failing URL

3. **THIRD**: Based on the URL, follow the appropriate solution above

4. **IF REBUILT**: After rebuild, restart nginx to see logs:
   ```bash
   docker exec servicecatalog_nginx tail -f /var/log/nginx/access.log
   ```
   Then try your app - you should see requests appear

## Expected Nginx Log Format

When your app works correctly, you should see logs like this:

```
10.25.1.22 - - [11/Jan/2026:13:XX:XX +0000] "OPTIONS /api/v1/chat/all-tickets HTTP/1.1" 200 2 "http://localhost:1420/" "Mozilla/5.0 ..." origin: "http://localhost:1420" upstream: 10.25.10.50:8000 rt=0.006
```

Key indicators:
- Source IP: `10.25.1.22` (your Windows machine)
- Method: `OPTIONS` (CORS preflight)
- Status: `200` (not 301 or 405)
- Referer: `http://localhost:1420/`
- Origin: `http://localhost:1420`

## Still Failing?

If after all steps it still fails, provide these details:

1. Screenshot of DevTools Network tab showing failed request
2. Full request URL from Network tab
3. Output of the PowerShell tests above
4. Console log showing [RuntimeConfig] initialization

This will help identify if it's:
- App using wrong URL (needs rebuild)
- Network routing issue (firewall/proxy)
- DNS resolution problem (hosts file)
