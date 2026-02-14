# Desktop Session Tracking - Configuration Guide

**Document Version:** 1.0
**Last Updated:** 2026-02-14
**Related:** `/src/backend/core/config.py` (PresenceSettings class)

---

## Overview

This guide explains the timing relationships for desktop session tracking configuration. Desktop sessions track Tauri app presence via Redis TTL keys with database cleanup jobs.

**Architecture:**
- **Redis (Authoritative):** Real-time presence via expiring keys
- **Database (Historical):** Session records for reports and audit
- **Heartbeat (Desktop App):** Periodic requests to refresh Redis TTL

---

## Configuration Parameters

### 1. `heartbeat_interval_seconds`

**Location:** `config.py:PresenceSettings.heartbeat_interval_seconds`
**Environment:** `PRESENCE_HEARTBEAT_INTERVAL_SECONDS`
**Default:** `300` (5 minutes)
**Type:** Integer (seconds)

**Purpose:**
Controls how often the Tauri desktop app sends heartbeat requests to the backend.

**Trade-offs:**
| Value | Pros | Cons | Use Case |
|-------|-------|-------|----------|
| 60-120s (1-2 min) | Accurate presence, fast offline detection | High backend load, more network traffic | Real-time requirements |
| 180-300s (3-5 min) | Balanced load and accuracy | Slightly delayed detection | General production (default) |
| 600s+ (10+ min) | Low resource usage | Slow offline detection, stale presence | Resource-constrained environments |

**Formula:**
```
backend_requests_per_hour = 3600 / heartbeat_interval_seconds
concurrent_users × backend_requests_per_hour = total_hourly_load
```

**Example:**
```
100 users × (3600 / 300) = 1,200 requests/hour
100 users × (3600 / 60) = 6,000 requests/hour
```

---

### 2. `ttl_seconds`

**Location:** `config.py:PresenceSettings.ttl_seconds`
**Environment:** `PRESENCE_TTL_SECONDS`
**Default:** `660` (11 minutes)
**Type:** Integer (seconds)
**Validation:** `>= 2 × heartbeat_interval_seconds`

**Purpose:**
Time-to-live for Redis presence keys. Keys expire automatically if not refreshed by heartbeat.

**Critical Relationship:**
```
ttl_seconds >= heartbeat_interval_seconds × 2
Recommended: ttl_seconds = heartbeat_interval_seconds × 2.2
```

**Why 2.2x?**
- **2x minimum:** Allows one full missed heartbeat cycle
- **+10% margin:** Tolerates network latency, processing delays, clock drift
- **Prevents false negatives:** Users won't be marked offline due to transient issues

**Validation Error Example:**
```
ValueError: ttl_seconds (400) must be at least 2x heartbeat_interval_seconds (300).
Recommended: 2.2x (660s) for safety margin.
```

**Example Calculations:**
```
heartbeat_interval_seconds = 300
ttl_seconds = 300 × 2.2 = 660 (11 minutes)

heartbeat_interval_seconds = 120
ttl_seconds = 120 × 2.2 = 264 (4.4 minutes)
```

---

### 3. `cleanup_timeout_minutes`

**Location:** Database model (not in config.py)
**Table:** `desktop_session_sessions`
**Column:** `cleanup_timeout_minutes`
**Default:** `20` (20 minutes)
**Type:** Integer (minutes)

**Purpose:**
APScheduler job interval for marking stale database sessions as inactive.

**Relationship:**
```
cleanup_timeout_minutes = 4 × heartbeat_interval_seconds (converted to minutes)
```

**Calculation:**
```
heartbeat_interval_seconds = 300 (5 minutes)
cleanup_timeout_minutes = 4 × 5 = 20 minutes

heartbeat_interval_seconds = 120 (2 minutes)
cleanup_timeout_minutes = 4 × 2 = 8 minutes
```

**Why 4x?**
- **Well below TTL:** `20 minutes << 11 minutes TTL` ensures Redis expires first
- **Database hygiene:** Prevents unbounded table growth
- **Reports only:** Database is NOT authoritative for presence (Redis is)

**Important:**
- This setting does NOT affect real-time presence
- Redis TTL controls presence, this only cleans DB records
- Set too low: Premature cleanup of valid sessions
- Set too high: Stale data in reports (but doesn't break presence)

---

## Configuration Presets

### Conservative (Default)

**Use Case:** Stable network, lower backend load, general production

```python
# Environment variables
PRESENCE_HEARTBEAT_INTERVAL_SECONDS=300  # 5 minutes
PRESENCE_TTL_SECONDS=660                  # 11 minutes (2.2x)
# Database: cleanup_timeout_minutes = 20   # 4x heartbeat

# Calculated load for 100 users:
# 100 × (3600/300) = 1,200 requests/hour
```

**Characteristics:**
- Low backend load
- Delayed offline detection (5-11 minutes)
- Longer-lived Redis keys
- Suitable for stable networks

---

### Aggressive

**Use Case:** Real-time requirements, high backend capacity

```python
# Environment variables
PRESENCE_HEARTBEAT_INTERVAL_SECONDS=120  # 2 minutes
PRESENCE_TTL_SECONDS=264                  # 4.4 minutes (2.2x)
# Database: cleanup_timeout_minutes = 8    # 4x heartbeat

# Calculated load for 100 users:
# 100 × (3600/120) = 3,000 requests/hour
```

**Characteristics:**
- High backend load (2.5x default)
- Fast offline detection (2-4 minutes)
- Shorter-lived Redis keys
- Suitable for real-time dashboards

---

### Balanced

**Use Case:** General production with moderate load

```python
# Environment variables
PRESENCE_HEARTBEAT_INTERVAL_SECONDS=180  # 3 minutes
PRESENCE_TTL_SECONDS=396                  # 6.6 minutes (2.2x)
# Database: cleanup_timeout_minutes = 12   # 4x heartbeat

# Calculated load for 100 users:
# 100 × (3600/180) = 2,000 requests/hour
```

**Characteristics:**
- Moderate backend load (1.7x default)
- Balanced offline detection (3-6 minutes)
- Middle-ground resource usage

---

## Invalid Configurations

### What NOT to Do

**Example 1: TTL Too Low**
```python
# ❌ WRONG - Causes false negatives
PRESENCE_HEARTBEAT_INTERVAL_SECONDS=300
PRESENCE_TTL_SECONDS=400  # < 2x heartbeat

# Result: Network latency causes users to appear offline
# Validator Error: ttl_seconds (400) must be at least 2x heartbeat_interval_seconds (300)
```

**Example 2: TTL Equal to Heartbeat**
```python
# ❌ WRONG - No tolerance for delays
PRESENCE_HEARTBEAT_INTERVAL_SECONDS=300
PRESENCE_TTL_SECONDS=300  # = 1x heartbeat

# Result: Any processing delay immediately expires the key
# Validator Error: ttl_seconds (300) must be at least 2x heartbeat_interval_seconds (300)
```

**Example 3: Mismatched Cleanup**
```python
# ❌ WRONG - Premature database cleanup
PRESENCE_HEARTBEAT_INTERVAL_SECONDS=300
PRESENCE_TTL_SECONDS=660  # OK
cleanup_timeout_minutes = 5  # Too low! Should be ~20

# Result: Valid sessions deleted from database before Redis expires
# Impact: Broken reports, but presence still works (Redis is authoritative)
```

**Example 4: Extremely High Heartbeat**
```python
# ❌ NOT RECOMMENDED - Stale presence
PRESENCE_HEARTBEAT_INTERVAL_SECONDS=3600  # 1 hour
PRESENCE_TTL_SECONDS=7920  # 2.2x (2.2 hours)

# Result: Users appear online for 2+ hours after closing app
# Impact: Misleading presence information, poor UX
```

---

## Troubleshooting

### Problem: Users Falsely Marked Offline

**Symptoms:**
- Users appear offline despite active app
- Presence status flickers between online/offline
- Reports show frequent offline transitions

**Diagnosis:**
```python
# Check configuration
import os
heartbeat = int(os.getenv("PRESENCE_HEARTBEAT_INTERVAL_SECONDS", "300"))
ttl = int(os.getenv("PRESENCE_TTL_SECONDS", "660"))

# Validate relationship
if ttl < 2 * heartbeat:
    print(f"❌ TTL ({ttl}) < 2x heartbeat ({heartbeat})")
    print("Fix: Increase PRESENCE_TTL_SECONDS to", int(heartbeat * 2.2))
```

**Solution:**
Increase `PRESENCE_TTL_SECONDS` to at least `2.2x heartbeat_interval_seconds`.

---

### Problem: Delayed Offline Detection

**Symptoms:**
- Users remain online after closing app
- Presence status lags behind reality
- Dashboard shows stale online status

**Diagnosis:**
```python
# Calculate detection window
heartbeat = int(os.getenv("PRESENCE_HEARTBEAT_INTERVAL_SECONDS", "300"))
ttl = int(os.getenv("PRESENCE_TTL_SECONDS", "660"))

detection_window = heartbeat + ttl
print(f"Offline detection window: {detection_window}s ({detection_window/60:.1f} minutes)")
```

**Solution:**
Decrease `PRESENCE_HEARTBEAT_INTERVAL_SECONDS` (and adjust `ttl_seconds` accordingly).

---

### Problem: High Backend Load

**Symptoms:**
- High CPU usage on backend
- Database connection pool exhaustion
- Slow response times

**Diagnosis:**
```python
# Calculate hourly load
heartbeat = int(os.getenv("PRESENCE_HEARTBEAT_INTERVAL_SECONDS", "300"))
users = 100  # Replace with actual user count

requests_per_hour = users * (3600 / heartbeat)
print(f"Hourly heartbeat load: {requests_per_hour:.0f} requests")
```

**Solution:**
Increase `PRESENCE_HEARTBEAT_INTERVAL_SECONDS` to reduce request frequency.

---

### Problem: Database Table Growth

**Symptoms:**
- `desktop_session_sessions` table growing unbounded
- Disk space increasing steadily
- Slow queries on session table

**Diagnosis:**
```sql
-- Check active session count
SELECT COUNT(*) FROM desktop_session_sessions WHERE is_active = true;

-- Check cleanup timeout
SELECT DISTINCT cleanup_timeout_minutes FROM desktop_session_sessions;
```

**Solution:**
Ensure `cleanup_timeout_minutes` is set appropriately (default: 20 minutes). If already set, check if APScheduler job is running.

---

## Configuration Validation

### Automated Validation

The `PresenceSettings` class validates configuration at startup:

```python
# config.py automatically validates:
@field_validator("ttl_seconds")
def validate_ttl_seconds(cls, v: int, info) -> int:
    heartbeat_interval = info.data.get("heartbeat_interval_seconds", 300)
    if v < 2 * heartbeat_interval:
        raise ValueError(
            f"ttl_seconds ({v}) must be at least 2x heartbeat_interval_seconds ({heartbeat_interval}). "
            f"Recommended: 2.2x ({int(heartbeat_interval * 2.2)}s) for safety margin."
        )
    return v
```

**Error Message:**
```
ValueError: ttl_seconds (400) must be at least 2x heartbeat_interval_seconds (300).
Recommended: 2.2x (660s) for safety margin.
```

### Manual Validation Checklist

Before deploying configuration changes:

- [ ] `ttl_seconds >= 2 × heartbeat_interval_seconds`
- [ ] `ttl_seconds >= heartbeat_interval_seconds × 2.2` (recommended)
- [ ] `cleanup_timeout_minutes = 4 × (heartbeat_interval_seconds / 60)`
- [ ] Calculated backend load is acceptable
- [ ] Offline detection window meets requirements
- [ ] Tested in staging environment

---

## Related Files

- **Configuration:** `/src/backend/core/config.py` (PresenceSettings class)
- **Model:** `/src/backend/db/model.py` (DesktopSession model)
- **Service:** `/src/backend/api/services/management/desktop_session_service.py`
- **Router:** `/src/backend/api/routers/management/desktop_sessions_router.py`
- **Cleanup Job:** `/src/backend/tasks/scheduler.py` (APScheduler configuration)

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-14 | 1.0 | Initial documentation for configuration relationships |

