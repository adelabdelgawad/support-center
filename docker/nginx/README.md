# Nginx HTTPS Reverse Proxy for IT-App

## Overview

This nginx container provides SSL/TLS termination for the IT-App frontend, allowing secure HTTPS access.

## Setup Summary

### 1. SSL Certificate (Self-Signed)
- **Location:** `docker/nginx/ssl/`
- **Certificate:** `cert.pem` (valid for 365 days)
- **Private Key:** `key.pem`
- **Domain:** `arc-webapp-01.andalusiagroup.net`

### 2. Nginx Configuration
- **Config File:** `docker/nginx/nginx.conf`
- **HTTP Port:** 80 (redirects to HTTPS)
- **HTTPS Port:** 443
- **Backend:** Next.js on `host.docker.internal:3010`

### 3. Docker Setup
- **Container:** `servicecatalog_nginx`
- **Image:** `nginx:alpine`
- **Network:** `servicecatalog_network`

## Accessing the Application

### HTTPS (Recommended)
```
https://arc-webapp-01.andalusiagroup.net
```

### HTTP (Auto-redirects to HTTPS)
```
http://arc-webapp-01.andalusiagroup.net
```

## WhatsApp Integration

The Zapier WhatsApp integration now uses HTTPS URLs:

```
Frontend Base URL: https://arc-webapp-01.andalusiagroup.net
Request Detail URL: https://arc-webapp-01.andalusiagroup.net/support-center/requests/{request_id}
```

## Docker Commands

### Start nginx
```bash
docker compose up -d nginx
```

### Stop nginx
```bash
docker compose stop nginx
```

### View logs
```bash
docker logs servicecatalog_nginx
```

### Restart nginx
```bash
docker compose restart nginx
```

### Reload nginx configuration (without downtime)
```bash
docker exec servicecatalog_nginx nginx -s reload
```

## SSL Certificate Details

The self-signed certificate will show a browser warning. To avoid this:

### Option 1: Add Security Exception (Quick)
1. Open `https://arc-webapp-01.andalusiagroup.net` in browser
2. Click "Advanced"
3. Click "Accept the Risk and Continue" (Firefox) or "Proceed" (Chrome)

### Option 2: Trust Certificate (Permanent)
1. Download the certificate:
   ```bash
   cp docker/nginx/ssl/cert.pem ~/arc-webapp-cert.pem
   ```

2. Import into browser:
   - **Firefox:** Preferences → Privacy & Security → Certificates → View Certificates → Import
   - **Chrome:** Settings → Privacy and Security → Security → Manage Certificates → Import

3. **Mobile (Android):**
   - Copy cert.pem to phone
   - Settings → Security → Install from storage
   - Choose certificate file

4. **Mobile (iOS):**
   - Email cert.pem to yourself
   - Open attachment → Install Profile
   - Settings → General → About → Certificate Trust Settings → Enable

### Option 3: Use Organization CA (Production)
Request a certificate from your IT security team signed by your organization's Certificate Authority.

## Renewing the Certificate

The self-signed certificate expires after 365 days. To renew:

```bash
# Generate new certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/key.pem \
  -out docker/nginx/ssl/cert.pem \
  -subj "/C=EG/ST=Cairo/L=Cairo/O=AndalusiaGroup/CN=arc-webapp-01.andalusiagroup.net"

# Restart nginx
docker compose restart nginx
```

## Troubleshooting

### 1. Certificate Warning in Browser
**Expected behavior** - Self-signed certificates trigger warnings. Follow "SSL Certificate Details" above.

### 2. Connection Refused
```bash
# Check if nginx is running
docker ps | grep nginx

# Check nginx logs
docker logs servicecatalog_nginx

# Verify ports are mapped
docker port servicecatalog_nginx
```

### 3. 502 Bad Gateway
- Ensure Next.js is running on port 3010
- Check backend logs: `tail -f /path/to/nextjs/logs`

### 4. Cannot Access from Mobile
- Ensure port 443 is open in firewall
- Try accessing via IP: `https://10.25.10.50`
- Check if mobile is on same network

## Configuration Files

### Environment Variable
```bash
# In src/backend/.env
FRONTEND_BASE_URL=https://arc-webapp-01.andalusiagroup.net
```

### Nginx Config Structure
```
docker/nginx/
├── nginx.conf          # Main configuration
├── ssl/
│   ├── cert.pem       # SSL certificate
│   └── key.pem        # Private key
└── README.md          # This file
```

## Security Features

- ✅ TLS 1.2 and TLS 1.3 support
- ✅ Strong cipher suites
- ✅ HSTS (HTTP Strict Transport Security)
- ✅ X-Frame-Options: SAMEORIGIN
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection
- ✅ Automatic HTTP → HTTPS redirect

## Performance Features

- ✅ Gzip compression
- ✅ WebSocket support
- ✅ HTTP/2 enabled
- ✅ Connection keep-alive
- ✅ Client max body size: 100MB

## Next Steps

1. **For Production:** Replace self-signed certificate with organization CA certificate
2. **For External Access:** Configure firewall rules for ports 80 and 443
3. **For Monitoring:** Add nginx metrics to Prometheus (optional)
