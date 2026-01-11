# Server-Side Nginx Fix for Tauri CORS (Public + Internal Access)

## Problem

Tauri app needs to work both:
- ✅ **Inside network**: `supportcenter.andalusiagroup.net` → `10.25.10.50`
- ✅ **Outside network**: `supportcenter.andalusiagroup.net` → `41.196.65.226`

Currently, requests from outside network get **redirected during CORS preflight**, causing errors.

---

## Root Cause

The nginx server block for `supportcenter.andalusiagroup.net` (lines 71-114) has:

```nginx
location /api/v1/ {
    # No redirect - proxies to backend
}

location / {
    return 301 https://$host$request_uri;  # ⚠️ Redirects everything else
}
```

**Problem scenarios:**

1. **Trailing slash mismatch**: Request to `/api/v1/chat/all-tickets` might not match `/api/v1/` location
2. **Location priority**: Nginx location matching might be routing incorrectly
3. **Missing OPTIONS handling**: OPTIONS requests might need special treatment

---

## Fix: Update Nginx Configuration

### Step 1: Backup Current Config

```bash
# On arc-webapp-01 server
cd /home/arc-webapp-01/support_center
cp docker/nginx/nginx.conf docker/nginx/nginx.conf.backup
```

### Step 2: Update HTTP Server Block for Public Domain

Edit `docker/nginx/nginx.conf` and replace the **first server block** (lines 71-114):

```nginx
# HTTP Server - ACME challenges + API passthrough + HTTPS redirect
server {
    listen 80;
    server_name supportcenter.andalusiagroup.net;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/acme-challenge;
    }

    # API routes - forward to backend WITHOUT redirect (for CORS preflight)
    # CRITICAL: Use regex to match /api/v1/* (not just /api/v1/)
    location ~ ^/api/v1/ {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;

        # Standard proxy headers
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Forward authentication and custom headers
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Client-Private-IP $http_x_client_private_ip;
        proxy_set_header Referer $http_referer;
        proxy_set_header User-Agent $http_user_agent;

        # Forward CORS headers (critical for preflight OPTIONS)
        proxy_set_header Origin $http_origin;
        proxy_set_header Access-Control-Request-Method $http_access_control_request_method;
        proxy_set_header Access-Control-Request-Headers $http_access_control_request_headers;

        # API timeouts
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    # Health check endpoint (for monitoring)
    location = /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Redirect everything else to HTTPS (frontend pages)
    location / {
        return 301 https://$host$request_uri;
    }
}
```

**Key changes:**
1. ✅ Changed `location /api/v1/` to `location ~ ^/api/v1/` (regex match - more reliable)
2. ✅ Added `location = /health` before the catch-all redirect
3. ✅ Ensures `/api/v1/*` matches correctly regardless of path

### Step 3: Apply Changes

```bash
# Test configuration syntax
docker exec servicecatalog_nginx nginx -t

# If test passes, reload nginx
docker exec servicecatalog_nginx nginx -s reload

# Watch logs to verify
docker exec servicecatalog_nginx tail -f /var/log/nginx/access.log
```

### Step 4: Verify Fix

From **any machine** (Windows or server):

```bash
# Test OPTIONS request (CORS preflight) via public domain
curl -X OPTIONS \
  -H "Origin: http://localhost:1420" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  http://supportcenter.andalusiagroup.net/api/v1/chat/all-tickets \
  -v

# Expected output:
# < HTTP/1.1 200 OK
# < access-control-allow-origin: http://localhost:1420
# (NOT HTTP/1.1 301 Moved Permanently)
```

---

## Alternative Fix (If Above Doesn't Work)

If the regex location doesn't work, use **explicit location blocks** for common paths:

```nginx
server {
    listen 80;
    server_name supportcenter.andalusiagroup.net;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/acme-challenge;
    }

    # API v1 - prefix match (longest match wins)
    location ^~ /api/v1/ {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;

        # ... same proxy headers as above
    }

    # Explicit match for /api/v1 without trailing slash
    location = /api/v1 {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;

        # ... same proxy headers as above
    }

    # Health check
    location = /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Redirect everything else to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
```

**Key differences:**
- `^~` prefix modifier = "priority prefix match"
- Added `location = /api/v1` for exact match without trailing slash
- Nginx will check `^~` locations before regex locations

---

## Debugging Commands (If Still Failing)

### 1. Check Which Location Block is Handling the Request

Enable debug logging temporarily:

```bash
# Edit nginx.conf, line 4:
error_log /var/log/nginx/error.log debug;

# Reload
docker exec servicecatalog_nginx nginx -s reload

# Make a request from Tauri app, then check logs:
docker exec servicecatalog_nginx tail -100 /var/log/nginx/error.log | grep -i "location\|rewrite"

# Disable debug logging after (produces HUGE logs):
# error_log /var/log/nginx/error.log warn;
```

### 2. Test Direct Backend Connection (Bypass Nginx)

```bash
# From Windows machine (if you have curl):
curl -X OPTIONS \
  -H "Origin: http://localhost:1420" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  http://10.25.10.50:8000/api/v1/chat/all-tickets \
  -v

# Should return 200 OK with CORS headers
```

### 3. Check for Other Nginx Instances or Load Balancers

```bash
# Check if there's another nginx or proxy in front
netstat -tlnp | grep :80

# Check firewall rules that might redirect
iptables -t nat -L -n -v | grep 80
```

---

## Expected Behavior After Fix

### From Tauri App (Windows - Inside Network):
1. DNS resolves: `supportcenter.andalusiagroup.net` → `10.25.10.50`
2. Connects to nginx port 80
3. Matches `location ~ ^/api/v1/`
4. Proxies to backend
5. ✅ **No redirect, no CORS error**

### From Tauri App (Outside Network):
1. DNS resolves: `supportcenter.andalusiagroup.net` → `41.196.65.226`
2. Connects to nginx port 80 (via public IP)
3. Matches `location ~ ^/api/v1/`
4. Proxies to backend
5. ✅ **No redirect, no CORS error**

### From Web Browser (Any Location):
1. Requests to `/` → Redirected to HTTPS
2. ✅ **Frontend still secured with HTTPS redirect**

---

## Rollback (If Something Breaks)

```bash
# Restore backup
cd /home/arc-webapp-01/support_center
cp docker/nginx/nginx.conf.backup docker/nginx/nginx.conf

# Reload
docker exec servicecatalog_nginx nginx -s reload
```

---

## Files to Update

- ✅ `docker/nginx/nginx.conf` - Server-side (apply fix above)
- ✅ `src/requester-app/src/.env` - **REVERT to hostname**:
  ```env
  VITE_API_URL=http://supportcenter.andalusiagroup.net/api/v1
  ```
- ✅ `src/requester-app/src/src-tauri/tauri.conf.json` - **Already fixed** (CSP without :8000)

---

## Next Steps

1. **On server**: Apply nginx configuration fix above
2. **On Windows**: Revert `.env` back to hostname
3. **Rebuild Tauri app**
4. **Test from inside and outside network**

The fix ensures `/api/v1/*` requests are NEVER redirected, while still redirecting frontend pages to HTTPS for security.
