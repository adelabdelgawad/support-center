# Quick Reference: Invalid HTTP Request Debugging

## What Was Added

Enhanced debugging capabilities to track down "Invalid HTTP request received" warnings from uvicorn.

## Files Added/Modified

### New Files
1. **`core/middleware/request_debug.py`** - Request debugging middleware (2 layers)
2. **`core/uvicorn_logging.py`** - Enhanced uvicorn error logging configuration
3. **`docs/DEBUGGING_INVALID_HTTP_REQUESTS.md`** - Complete debugging guide

### Modified Files
1. **`core/config.py`** - Added `LOG_ENABLE_REQUEST_DEBUG` and `LOG_ENABLE_RAW_REQUEST_LOGGING` flags
2. **`core/middleware/__init__.py`** - Export new middleware classes
3. **`app/factory.py`** - Conditionally add debugging middleware
4. **`core/lifespan/tasks.py`** - Setup uvicorn error logging on startup
5. **`main.py`** - Use custom uvicorn logging config
6. **`.env`** and **`.env.example`** - Added logging configuration section

## Quick Start

### 1. Check Existing Logs (Always Available)

```bash
cd /home/arc-webapp-01/support-center/src/backend
tail -f logs/invalid_requests.log
```

This file captures all uvicorn errors including invalid HTTP requests. No configuration needed.

### 2. Enable Request Debugging (Medium Detail)

Edit `.env`:
```bash
LOG_ENABLE_REQUEST_DEBUG=true
```

Restart backend:
```bash
pkill -f "uvicorn main:app"
cd /home/arc-webapp-01/support-center/src/backend
python main.py
```

Watch logs:
```bash
tail -f logs/app.log | grep -E "(request_debug|📥|✅|❌)"
```

### 3. Enable Raw Request Logging (Maximum Detail)

⚠️ **Very verbose - use only for short debugging sessions!**

Edit `.env`:
```bash
LOG_ENABLE_REQUEST_DEBUG=true
LOG_ENABLE_RAW_REQUEST_LOGGING=true
```

Restart backend and watch logs:
```bash
tail -f logs/app.log | grep -E "(RAW|🔍)"
```

## Understanding the Output

### Layer 1: Enhanced Uvicorn Logging (Always On)
- **File:** `logs/invalid_requests.log`
- **What:** Uvicorn errors and HTTP parsing failures
- **Example:**
  ```
  2026-01-16 14:56:02 | uvicorn.error | WARNING | Invalid HTTP request received.
  ```

### Layer 2: Request Debug Middleware (Optional)
- **Enable:** `LOG_ENABLE_REQUEST_DEBUG=true`
- **File:** `logs/app.log`
- **What:** Detailed request info after successful HTTP parsing
- **Example:**
  ```
  📥 Incoming request: GET /api/v1/health from 192.168.1.100:54321
     Protocol: http://localhost:8000
     HTTP Version: 1.1
     Headers: {'host': 'localhost:8000', 'user-agent': 'curl/7.68.0'}
  ✅ Response: 200 for GET /api/v1/health
  ```

### Layer 3: Raw ASGI Logging (Optional)
- **Enable:** `LOG_ENABLE_RAW_REQUEST_LOGGING=true`
- **File:** `logs/app.log`
- **What:** Raw ASGI data before HTTP parsing (very verbose)
- **Example:**
  ```
  🔍 [RAW] HTTP connection from 192.168.1.200:12345
     [RAW] Method: GET
     [RAW] Path: /api/v1/requests
     [RAW] Header count: 5
     [RAW] Header: host: localhost:8000
     [RAW] Body chunk received: 156 bytes
  ```

## Common Scenarios

### Scenario 1: Occasional Invalid Requests
**Likely cause:** Port scanners or bots

**Action:** Check `logs/invalid_requests.log` for patterns (IPs, timing). Usually safe to ignore if infrequent.

### Scenario 2: Invalid Requests from Known Clients
**Likely cause:** Client misconfiguration or bug

**Action:**
1. Enable `LOG_ENABLE_REQUEST_DEBUG=true`
2. Correlate with client logs
3. Check for proxy/load balancer issues

### Scenario 3: Can't Identify the Source
**Action:**
1. Enable both debug flags temporarily
2. Reproduce the issue
3. Check logs for patterns
4. Consider network packet capture (tcpdump/Wireshark)

## Disabling Debug Logging

Edit `.env`:
```bash
LOG_ENABLE_REQUEST_DEBUG=false
LOG_ENABLE_RAW_REQUEST_LOGGING=false
```

Restart backend. Layer 1 (enhanced uvicorn logging) remains active with minimal overhead.

## Performance Impact

| Layer | Impact | Log Volume | Use Case |
|-------|--------|------------|----------|
| Layer 1 (Always On) | Negligible | Low | Production monitoring |
| Layer 2 (Optional) | Low | Medium | Development/debugging |
| Layer 3 (Optional) | Medium | Very High | Short-term troubleshooting only |

## Need More Help?

See the complete guide: `docs/DEBUGGING_INVALID_HTTP_REQUESTS.md`

## Tips

1. **Start with Layer 1** - Check `logs/invalid_requests.log` first
2. **Enable Layer 2 for context** - Shows what valid requests look like
3. **Use Layer 3 sparingly** - Very verbose, enable only when needed
4. **Grep is your friend** - Use grep to filter massive logs
5. **Check timing patterns** - Correlate with deployment/traffic changes
6. **Monitor client logs too** - Client-side errors often provide clues

## Example Debugging Session

```bash
# 1. Check if invalid requests are being logged
tail -20 logs/invalid_requests.log

# 2. Enable request debugging
echo "LOG_ENABLE_REQUEST_DEBUG=true" >> .env

# 3. Restart backend
pkill -f "uvicorn main:app"
python main.py &

# 4. Monitor in real-time with filtering
tail -f logs/app.log | grep -E "(request_debug|Invalid|ERROR|WARNING)"

# 5. Reproduce the issue or wait for it to occur naturally

# 6. Analyze the logs
# Look for patterns in:
# - Source IPs
# - Request timing
# - Request headers
# - Protocol versions

# 7. If still unclear, enable raw logging
echo "LOG_ENABLE_RAW_REQUEST_LOGGING=true" >> .env
pkill -f "uvicorn main:app"
python main.py &

# 8. Capture a few requests then disable
# Edit .env to set LOG_ENABLE_RAW_REQUEST_LOGGING=false
```
