# Nginx Pattern Reference

Reverse proxy configuration for multi-service applications.

## Complete nginx.conf

```nginx
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 10000;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging format with upstream info
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'origin: "$http_origin" '
                    'upstream: $upstream_addr rt=$request_time';

    access_log /var/log/nginx/access.log main;

    # Performance settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/rss+xml font/truetype font/opentype
               application/vnd.ms-fontobject image/svg+xml;

    # Connection limits per IP (DDoS protection)
    limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;
    limit_conn conn_limit_per_ip 100;

    # Backend API upstream (load balanced)
    upstream backend_api {
        least_conn;  # Route to least busy server
        
        server backend-1:8000 weight=1 max_fails=3 fail_timeout=30s;
        server backend-2:8001 weight=1 max_fails=3 fail_timeout=30s;
        server backend-3:8002 weight=1 max_fails=3 fail_timeout=30s;
        
        keepalive 32;  # Keep connections alive
    }

    # SignalR upstream (real-time)
    upstream signalr_service {
        server signalr-service:5000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # WebSocket upgrade mapping
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    # HTTP Server - Redirect to HTTPS
    server {
        listen 80;
        server_name example.com www.example.com;

        # Let's Encrypt ACME challenge
        location /.well-known/acme-challenge/ {
            root /var/www/acme-challenge;
        }

        # Redirect all other requests to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS Server - Main application
    server {
        listen 443 ssl;
        http2 on;
        server_name example.com www.example.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        
        # Modern SSL settings
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
        ssl_prefer_server_ciphers off;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' wss: https:; font-src 'self' data:; frame-ancestors 'self';" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # SignalR WebSocket endpoint
        location /signalr/ {
            proxy_pass http://signalr_service/;
            proxy_http_version 1.1;

            # WebSocket headers
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;

            # Proxy headers
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Long timeouts for persistent connections
            proxy_connect_timeout 86400s;
            proxy_send_timeout 86400s;
            proxy_read_timeout 86400s;

            proxy_cache_bypass $http_upgrade;
            proxy_buffering off;
        }

        # Backend API
        location /api/v1/ {
            proxy_pass http://backend_api;
            proxy_http_version 1.1;

            # Proxy headers
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # CORS headers passthrough
            proxy_set_header Origin $http_origin;
            proxy_set_header Access-Control-Request-Method $http_access_control_request_method;
            proxy_set_header Access-Control-Request-Headers $http_access_control_request_headers;

            # Timeouts
            proxy_connect_timeout 300s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;
            proxy_buffering off;
        }

        # Frontend application (Next.js)
        location / {
            proxy_pass http://frontend:3010;
            proxy_http_version 1.1;

            # WebSocket support (for HMR in dev)
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';

            # Proxy headers
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $http_host;
            proxy_set_header X-Forwarded-Port 443;

            proxy_connect_timeout 300s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;
            proxy_cache_bypass $http_upgrade;
            proxy_buffering off;
        }

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
```

## Load Balancing Strategies

### Least Connections (Recommended for APIs)
```nginx
upstream backend_api {
    least_conn;
    server backend-1:8000;
    server backend-2:8001;
}
```

### Round Robin (Default)
```nginx
upstream backend_api {
    server backend-1:8000;
    server backend-2:8001;
}
```

### Weighted
```nginx
upstream backend_api {
    server backend-1:8000 weight=3;  # 3x traffic
    server backend-2:8001 weight=1;
}
```

### IP Hash (Session Affinity)
```nginx
upstream backend_api {
    ip_hash;
    server backend-1:8000;
    server backend-2:8001;
}
```

## WebSocket Configuration

```nginx
# Map for WebSocket upgrade
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location /ws/ {
    proxy_pass http://backend_api;
    proxy_http_version 1.1;
    
    # Required for WebSocket
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    
    # Long timeouts
    proxy_connect_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_read_timeout 86400s;
    
    proxy_buffering off;
}
```

## SSL Certificate with Let's Encrypt

```nginx
# HTTP server for ACME challenges
server {
    listen 80;
    server_name example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/acme-challenge;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

## Rate Limiting

```nginx
# Define rate limit zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://backend_api;
}
```

## Security Headers Summary

```nginx
# HSTS
add_header Strict-Transport-Security "max-age=63072000" always;

# CSP
add_header Content-Security-Policy "default-src 'self';" always;

# Prevent clickjacking
add_header X-Frame-Options "SAMEORIGIN" always;

# Prevent MIME sniffing
add_header X-Content-Type-Options "nosniff" always;

# XSS protection
add_header X-XSS-Protection "1; mode=block" always;
```

## Key Patterns

1. **Upstream blocks** - Define backend pools with health checks
2. **Location blocks** - Route by URL path
3. **Proxy headers** - Forward client info to backends
4. **WebSocket support** - Upgrade connection headers
5. **SSL termination** - Handle HTTPS at nginx
6. **Security headers** - Add protection headers
7. **Gzip compression** - Compress responses
8. **Connection limits** - DDoS protection
