# Server-Side Redirect Issue - Investigation & Fix

## Problem Summary

Tauri app shows CORS error: **"Redirect is not allowed for a preflight request"**

The OPTIONS (CORS preflight) request is receiving a redirect response instead of 200 OK, which browsers reject.

---

## Root Cause

### DNS Resolution Issue

The domain `supportcenter.andalusiagroup.net` resolves to **TWO IP addresses**:

```
41.196.65.226 (public/external IP)
10.25.10.50   (internal IP)
```

**What's happening:**

1. ✅ curl from Windows connects to `10.25.10.50` → **Works (200 OK)**
2. ❌ Tauri browser engine tries `41.196.65.226` first → **Gets redirected**
3. ❌ Browser rejects redirect during CORS preflight → **Request fails**

### Nginx Configuration

There are **two HTTP server blocks** on port 80:

**Block 1 (lines 71-114):** For public domain names
```nginx
server {
    listen 80;
    server_name arc-webapp-01.andalusiagroup.net supportcenter.andalusiagroup.net;

    # API routes - no redirect
    location /api/v1/ {
        proxy_pass http://backend_api;
        ...
    }

    # Everything else - redirect to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
```

**Block 2 (lines 117-206):** For internal hostnames (default_server)
```nginx
server {
    listen 80 default_server;
    server_name arc-webapp-01 arc-webapp-01.andalusia.loc 10.25.10.50 localhost;

    # API routes - no redirect
    location /api/v1/ {
        proxy_pass http://backend_api;
        ...
    }

    # Frontend - no redirect
    location / {
        proxy_pass http://10.25.10.50:3010;
        ...
    }
}
```

**The issue:** When connecting via `41.196.65.226`, the request matches **Block 1**, and if the path doesn't match `/api/v1/` exactly, it gets redirected.

---

## Server-Side Debugging Commands

Run these commands from **arc-webapp-01** server to investigate:

### 1. Check Nginx Logs for Redirects

```bash
# Watch nginx access logs in real-time
docker exec servicecatalog_nginx tail -f /var/log/nginx/access.log

# Then trigger a request from Tauri app and look for:
# - Status code 301/302 (redirect)
# - Which IP the request came from
# - Which server block handled it
```

### 2. Test OPTIONS Request to Both IPs

```bash
# Test internal IP (should work)
curl -X OPTIONS \
  -H "Origin: http://localhost:1420" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  http://10.25.10.50/api/v1/chat/all-tickets \
  -v

# Test external IP (might redirect)
curl -X OPTIONS \
  -H "Origin: http://localhost:1420" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  http://41.196.65.226/api/v1/chat/all-tickets \
  -H "Host: supportcenter.andalusiagroup.net" \
  -v
```

### 3. Check Which Server Block is Handling Requests

```bash
# Check nginx error log for server block routing
docker exec servicecatalog_nginx tail -f /var/log/nginx/error.log

# Reload nginx to apply any config changes
docker exec servicecatalog_nginx nginx -s reload
```

### 4. Verify Nginx Configuration

```bash
# Test nginx configuration syntax
docker exec servicecatalog_nginx nginx -t

# Check which server blocks are defined
docker exec servicecatalog_nginx nginx -T | grep -A 5 "^server {"
```

---

## Temporary Fix Applied (Client-Side)

**Updated Tauri app .env to use internal IP directly:**

```env
# Before (caused redirect via external IP)
VITE_API_URL=http://supportcenter.andalusiagroup.net/api/v1

# After (uses internal IP, bypasses DNS resolution)
VITE_API_URL=http://10.25.10.50/api/v1
```

This forces the Tauri app to connect to the internal IP, avoiding the redirect issue.

**Rebuild required:**
```bash
cd E:\workspace\support_center\src\requester-app\src
npm run tauri dev    # For testing
# OR
npm run tauri build  # For production
```

---

## Permanent Server-Side Fixes (Choose One)

### Option 1: Add Internal DNS Record (Recommended)

Create an internal DNS record for a subdomain that only resolves to the internal IP:

```dns
# In your internal DNS server (10.25.10.10)
supportcenter-internal.andalusia.loc  →  10.25.10.50
```

Then update Tauri .env:
```env
VITE_API_URL=http://supportcenter-internal.andalusia.loc/api/v1
```

**Pros:**
- Clean URL
- No nginx changes needed
- Works for all internal clients

**Cons:**
- Requires DNS configuration

---

### Option 2: Update Nginx to Handle External IP Correctly

Add the external IP to the **default_server** block's `server_name`:

```nginx
# File: docker/nginx/nginx.conf
# Line 117-119

server {
    listen 80 default_server;
    server_name arc-webapp-01 arc-webapp-01.andalusia.loc 10.25.10.50 41.196.65.226 localhost;
    # ... rest of config (no HTTPS redirect)
}
```

Then restart nginx:
```bash
docker-compose restart nginx
```

**Pros:**
- Simple nginx change
- No DNS changes needed

**Cons:**
- External traffic won't be redirected to HTTPS (security concern)

---

### Option 3: Remove HTTPS Redirect from Public Server Block

Modify the first server block to not redirect `/` to HTTPS:

```nginx
# File: docker/nginx/nginx.conf
# Lines 71-114

server {
    listen 80;
    server_name arc-webapp-01.andalusiagroup.net supportcenter.andalusiagroup.net;

    location /.well-known/acme-challenge/ {
        root /var/www/acme-challenge;
    }

    location /api/v1/ {
        proxy_pass http://backend_api;
        # ... existing config
    }

    # NEW: Proxy to frontend instead of redirect
    location / {
        proxy_pass http://10.25.10.50:3010;
        # ... same config as HTTPS block
    }
}
```

**Pros:**
- Allows HTTP access for Tauri app via domain name
- No DNS changes needed

**Cons:**
- Disables HTTPS redirect for public domain (security concern)
- Not recommended for production

---

## Verification Steps (After Fix)

1. **From Server:**
   ```bash
   # Watch logs
   docker exec servicecatalog_nginx tail -f /var/log/nginx/access.log
   ```

2. **From Windows (Tauri app):**
   - Open app and trigger API request
   - Check DevTools Network tab
   - Should see: `Status: 200 OK` (not 301/302)

3. **Check Server Logs:**
   - Should see: `"OPTIONS /api/v1/... HTTP/1.1" 200`
   - Should NOT see: `"OPTIONS /api/v1/... HTTP/1.1" 301`

---

## Current Status

✅ **Network/CORS configuration:** Working (verified with curl)
✅ **Client-side CSP:** Fixed (removed `:8000` port)
❌ **DNS/Nginx routing:** External IP causes redirect
✅ **Temporary fix:** Using internal IP directly in Tauri .env

**Next Step:** Run server-side debugging commands above to confirm which IP is causing the redirect, then choose a permanent fix option.
