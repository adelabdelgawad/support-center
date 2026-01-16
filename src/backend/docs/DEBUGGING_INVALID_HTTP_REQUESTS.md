# Debugging Invalid HTTP Requests

This guide explains how to debug and track down "Invalid HTTP request received" warnings from uvicorn.

## Overview

The warning "Invalid HTTP request received" from uvicorn typically occurs when:

1. **Malformed HTTP requests** - Client sends invalid HTTP syntax
2. **Non-HTTP traffic** - Binary data, port scanners, or non-HTTP protocols hitting the HTTP server
3. **Incomplete requests** - Client disconnects before sending complete request
4. **Protocol mismatches** - HTTP/2 client connecting to HTTP/1.1 server, or vice versa
5. **Oversized headers** - Headers exceeding uvicorn's limits
6. **Invalid characters** - Non-ASCII or control characters in headers

## Debugging Layers

The application now has three layers of debugging for tracking invalid requests:

### Layer 1: Enhanced Uvicorn Error Logging (Always Active)

**File:** `logs/invalid_requests.log`

This layer captures all uvicorn warnings and errors, including the "Invalid HTTP request received" warnings. It's always enabled and requires no configuration.

**What it captures:**
- Uvicorn error messages
- HTTP parsing library (httptools, h11) errors
- Stack traces for protocol violations

### Layer 2: Request Debug Middleware (Optional)

**Enable with:** `LOG_ENABLE_REQUEST_DEBUG=true` in `.env`

**File:** Application logs (console + `logs/app.log`)

This middleware logs detailed information about each HTTP request **after** it has been successfully parsed by uvicorn.

**What it captures:**
- Request method, path, and URL
- Client IP and port
- HTTP version and protocol
- All headers (with sensitive data redacted)
- Response status code
- Request processing time

**When to use:**
- When you want to see what valid requests look like
- To correlate valid requests with invalid request warnings
- To analyze patterns in request headers

### Layer 3: Raw ASGI Request Logging (Very Verbose)

**Enable with:** `LOG_ENABLE_RAW_REQUEST_LOGGING=true` in `.env`

**File:** Application logs (console + `logs/app.log`)

This is the most detailed layer - it intercepts requests at the ASGI level **before** uvicorn's HTTP parser processes them.

**What it captures:**
- Raw ASGI scope data
- Raw header bytes (before decoding)
- Request body chunks as they arrive
- Preview of body content (first 200 bytes)
- Failures in header decoding

**When to use:**
- When Layer 1 and 2 don't provide enough information
- To see malformed requests that fail during HTTP parsing
- To debug binary data or encoding issues

**Warning:** This is VERY verbose and will log extensively. Use only for short debugging sessions.

## Setup Instructions

### 1. Basic Setup (Layer 1 Only)

No configuration needed - just check the logs:

```bash
cd /home/arc-webapp-01/support-center/src/backend
tail -f logs/invalid_requests.log
```

This will show all uvicorn errors including invalid HTTP requests.

### 2. Enable Request Debug Middleware (Layer 2)

Add to your `.env` file:

```bash
LOG_ENABLE_REQUEST_DEBUG=true
```

Restart the backend:

```bash
# Stop existing process
pkill -f "uvicorn main:app"

# Start with new config
cd /home/arc-webapp-01/support-center/src/backend
source .venv/bin/activate  # or: . .venv/bin/activate
python main.py
```

Watch the logs:

```bash
tail -f logs/app.log | grep -E "(request_debug|📥|✅|❌)"
```

### 3. Enable Raw Request Logging (Layer 3)

⚠️ **WARNING:** Very verbose - use only for short debugging sessions!

Add to your `.env` file:

```bash
LOG_ENABLE_REQUEST_DEBUG=true
LOG_ENABLE_RAW_REQUEST_LOGGING=true
```

Restart the backend and watch logs:

```bash
tail -f logs/app.log | grep -E "(RAW|🔍)"
```

## Analyzing the Logs

### Example 1: Valid Request

```
2026-01-16 15:00:00 | request_debug | INFO | 📥 Incoming request: GET /api/v1/health from 192.168.1.100:54321
2026-01-16 15:00:00 | request_debug | DEBUG |    Protocol: http://localhost:8000
2026-01-16 15:00:00 | request_debug | DEBUG |    HTTP Version: 1.1
2026-01-16 15:00:00 | request_debug | DEBUG |    Headers: {'host': 'localhost:8000', 'user-agent': 'curl/7.68.0'}
2026-01-16 15:00:00 | request_debug | INFO | ✅ Response: 200 for GET /api/v1/health
```

### Example 2: Invalid Request

```
2026-01-16 15:00:01 | uvicorn.error | WARNING | Invalid HTTP request received.
2026-01-16 15:00:01 | request_debug | ERROR | ❌ Error processing request: unknown
```

If Layer 3 is enabled, you'll see more details:

```
2026-01-16 15:00:01 | request_debug | INFO | 🔍 [RAW] HTTP connection from 192.168.1.200:12345
2026-01-16 15:00:01 | request_debug | DEBUG |    [RAW] Method: GET
2026-01-16 15:00:01 | request_debug | DEBUG |    [RAW] Path: /api/v1/requests
2026-01-16 15:00:01 | request_debug | ERROR |    [RAW] Failed to decode header: 'utf-8' codec can't decode byte 0xff
2026-01-16 15:00:01 | uvicorn.error | WARNING | Invalid HTTP request received.
```

## Common Issues and Solutions

### Issue: Random invalid requests from unknown IPs

**Likely cause:** Port scanners or bots probing the server

**Solution:**
- Check if IPs are from known scanner services (Shodan, Censys, etc.)
- Consider implementing rate limiting or IP blocking
- Usually safe to ignore if infrequent

### Issue: Invalid requests from known client IPs

**Likely cause:**
- Client misconfiguration (wrong protocol, headers)
- Client library bug
- Network proxy issues

**Solution:**
- Check client logs for corresponding errors
- Verify client is using correct HTTP version
- Check for proxy or load balancer issues

### Issue: Spike in invalid requests at specific times

**Likely cause:**
- Automated scanner or bot
- Misconfigured monitoring tool
- Legitimate client with intermittent issues

**Solution:**
- Correlate with other system logs
- Check monitoring tool configurations
- Analyze request patterns (timing, source IPs)

## Performance Impact

| Layer | Performance Impact | Log Volume | Use Case |
|-------|-------------------|------------|----------|
| Layer 1 | Negligible | Low | Always on, minimal overhead |
| Layer 2 | Low | Medium | Debugging valid request patterns |
| Layer 3 | Medium | Very High | Short-term debugging only |

## Disabling Debug Logging

To disable the debug layers, remove or set to false in `.env`:

```bash
LOG_ENABLE_REQUEST_DEBUG=false
LOG_ENABLE_RAW_REQUEST_LOGGING=false
```

Then restart the backend.

**Note:** Layer 1 (enhanced uvicorn logging) is always active and doesn't impact performance significantly.

## Log Files

All debugging logs are written to:

- `logs/invalid_requests.log` - Uvicorn errors and invalid requests (Layer 1)
- `logs/app.log` - Application logs including request debugging (Layers 2 & 3)

Both files have automatic rotation (10MB max, 5 backups).

## Troubleshooting

### Logs not appearing

1. Check `.env` file has correct settings
2. Verify backend was restarted after config changes
3. Check file permissions on `logs/` directory
4. Ensure `LOG_LEVEL` is set to `INFO` or `DEBUG`

### Too much log output

1. Disable Layer 3 (`LOG_ENABLE_RAW_REQUEST_LOGGING=false`)
2. Use grep to filter logs: `tail -f logs/app.log | grep "Invalid HTTP"`
3. Consider increasing log rotation settings

### Still can't identify the issue

1. Enable all layers temporarily
2. Reproduce the issue with a single request
3. Capture network traffic with tcpdump or Wireshark
4. Share logs with the development team

## Additional Resources

- [Uvicorn Documentation](https://www.uvicorn.org/)
- [ASGI Specification](https://asgi.readthedocs.io/)
- [HTTP/1.1 RFC](https://tools.ietf.org/html/rfc7230)
