# Backend API Reference

**Document Version:** 1.0
**Last Updated:** 2026-02-14
**Backend:** FastAPI (Python 3.13+, async)

---

## Table of Contents

1. [Management APIs](#management-apis)
   - [Desktop Sessions](#desktop-sessions)
   - [Remote Access](#remote-access)
2. [Scheduled Jobs](#scheduled-jobs)
3. [Data Models](#data-models)

---

## Management APIs

### Desktop Sessions

#### GET /api/v1/management/desktop-sessions/active

Get all active desktop sessions across all users.

**Purpose:** Used by monitoring dashboard to display currently active sessions

**Response:**
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "ipAddress": "192.168.1.100",
    "appVersion": "1.0.0",
    "computerName": "DESKTOP-123",
    "osInfo": "Windows 11",
    "isActive": true,
    "createdAt": "2026-02-14T10:00:00Z",
    "lastHeartbeat": "2026-02-14T10:05:00Z",
    "authenticatedAt": "2026-02-14T10:00:00Z",
    "authMethod": "sso",
    "deviceFingerprint": "abc123"
  }
]
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal Dashboard

---

#### GET /api/v1/management/desktop-sessions/active-with-users

Get all active desktop sessions with user information and version policy status.

**Purpose:** Used by monitoring dashboard with enriched user and version data

**Response:**
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "ipAddress": "192.168.1.100",
    "appVersion": "1.0.0",
    "computerName": "DESKTOP-123",
    "osInfo": "Windows 11",
    "isActive": true,
    "createdAt": "2026-02-14T10:00:00Z",
    "lastHeartbeat": "2026-02-14T10:05:00Z",
    "authenticatedAt": "2026-02-14T10:00:00Z",
    "authMethod": "sso",
    "deviceFingerprint": "abc123",
    "user": {
      "id": "uuid",
      "username": "jdoe",
      "fullName": "John Doe"
    },
    "sessionTypeId": 2,
    "isLive": true,
    "versionStatus": "current",
    "targetVersion": "1.0.0"
  }
]
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal Dashboard (with version status)

---

#### GET /api/v1/management/desktop-sessions/{session_id}

Get a specific desktop session by ID.

**Purpose:** Retrieve detailed session information for a specific session

**Response:** `DesktopSessionRead` schema

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal Desktop Sessions page

---

#### POST /api/v1/management/desktop-sessions/{session_id}/heartbeat

Update desktop session heartbeat (called periodically by Tauri requester app).

**Purpose:** Refresh session activity timestamp and Redis presence key

**Request Body:** None (session_id in URL path)

**Changed Behavior (Phase 1 Critical Fixes):**
- Returns 410 Gone if session inactive > 1 hour (prevents resurrection)
- Uses optimistic locking (version field) to prevent race conditions

**Response Codes:**
- 200: Heartbeat updated successfully
- 404: Session not found
- 403: Authenticated user doesn't own this session
- 410: Session expired (inactive > 1 hour) - NEW in Phase 1
- 409: Optimistic lock conflict (concurrent update) - NEW in Phase 1

**Response:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "ipAddress": "192.168.1.100",
  "isActive": true,
  "lastHeartbeat": "2026-02-14T10:05:00Z",
  "version": 2
}
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** Requester App (Tauri) - periodic heartbeat

---

#### POST /api/v1/management/desktop-sessions/{session_id}/disconnect

Mark a desktop session as disconnected.

**Purpose:** Clean disconnect when Tauri app closes or admin forces disconnect

**Query Parameters:**
- `force`: boolean - Send WebSocket message to force client disconnect immediately

**Response:**
```json
{
  "message": "Desktop session disconnected successfully"
}
```

**Response Codes:**
- 200: Session disconnected successfully
- 400: Invalid session_id format
- 404: Session not found

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal (admin disconnect), Requester App (logout)

---

#### GET /api/v1/management/desktop-sessions/user/{user_id}

Get all desktop sessions for a specific user.

**Purpose:** View user's session history

**Query Parameters:**
- `active_only`: boolean - Only return active sessions (default: true)

**Response:** Array of `DesktopSessionRead` schemas

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal User details page

---

#### POST /api/v1/management/desktop-sessions/cleanup

Manual cleanup of stale desktop sessions.

**Purpose:** Admin-triggered cleanup of inactive sessions

**Query Parameters:**
- `timeout_minutes`: int - Minutes of inactivity before cleanup (default: 10)

**Response:**
```json
{
  "cleanedCount": 5,
  "message": "Cleaned up 5 stale desktop sessions"
}
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal Admin tools

---

#### GET /api/v1/management/desktop-sessions/stats

Get statistics for desktop sessions.

**Purpose:** Dashboard metrics for session counts

**Response:**
```json
{
  "totalSessions": 42,
  "desktopSessions": 42,
  "webSessions": 0,
  "mobileSessions": 0,
  "activeSessions": 42,
  "uniqueUsers": 38,
  "avgSessionDuration": null
}
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal Dashboard

---

### Desktop Session Configuration

#### GET /api/v1/management/desktop-sessions/config

Get desktop session configuration (heartbeat interval, Redis TTL).

**Purpose:** Used by Tauri app to sync heartbeat interval with server configuration

**Response:**
```json
{
  "heartbeatIntervalMs": 300000,
  "heartbeatIntervalSeconds": 300,
  "redisTtlSeconds": 660
}
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** Requester App (Tauri) on startup

---

#### GET /api/v1/management/desktop-sessions/presence/parity

Compare DB-based active sessions vs Redis presence keys.

**Purpose:** Validate Redis dual-write parity during Phase 1 migration

**Response:**
```json
{
  "dbActiveSessions": 42,
  "redisPresenceKeys": 42,
  "delta": 0
}
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** Monitoring/debugging tools

---

#### GET /api/v1/management/desktop-sessions/presence/user/{user_id}

Check if a specific user is currently present (has active Redis presence key).

**Purpose:** Real-time presence check from Redis (fast, no DB query)

**Response:**
```json
{
  "userId": "uuid",
  "present": true,
  "activeSessions": 1
}
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal presence indicators

---

#### POST /api/v1/management/desktop-sessions/{session_id}/push-update

Push update notification to a desktop session to trigger client upgrade.

**Purpose:** Force client upgrade via SignalR notification

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid",
  "userId": "uuid",
  "targetVersion": "1.1.0",
  "message": "Update notification sent for version 1.1.0"
}
```

**Response Codes:**
- 200: Update notification sent
- 404: Session not found
- 400: Session not active or no latest version configured

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** IT Portal Version Authority management

#### GET /api/v1/management/desktop-sessions/analytics/user-activity-heatmap

Get user activity heatmap data aggregated by hour and day of week.

**Purpose:** Provides activity patterns for desktop sessions over time, suitable for visualization with a heatmap chart.

**Query Parameters:**
- `days_back` (optional, default: 30): Number of days to look back for activity data

**Response:**
```json
{
  "data": [
    {
      "hour": 9,
      "dayOfWeek": 1,
      "count": 15
    },
    {
      "hour": 10,
      "dayOfWeek": 1,
      "count": 23
    }
  ],
  "totalActivity": 1250,
  "dateRange": {
    "start": "2026-01-15T00:00:00Z",
    "end": "2026-02-14T23:59:59Z"
  },
  "breakdown": {
    "0": "150",
    "1": "320",
    "2": "280",
    "3": "200",
    "4": "100",
    "5": "80",
    "6": "120"
  }
}
```

**Source:** `/src/backend/api/routers/management/desktop_sessions_router.py`
**Used by:** Analytics dashboard, activity monitoring

---

### Remote Access

#### POST /api/v1/management/remote-access/start

Start a remote access session.

**Purpose:** Initiate remote desktop connection to requester

**Request:**
```json
{
  "requestId": "uuid",
  "requesterSessionId": "uuid"
}
```

**Response:** `RemoteAccessSession` schema

**Source:** `/src/backend/api/routers/management/remote_access_router.py`
**Used by:** IT Portal Remote Access feature

---

#### POST /api/v1/management/remote-access/{session_id}/heartbeat

Update remote access session heartbeat.

**Purpose:** Keep remote session alive during active connection

**Response:** Updated `RemoteAccessSession` schema

**Source:** `/src/backend/api/routers/management/remote_access_router.py`
**Used by:** Remote Access session handling

---

#### POST /api/v1/management/remote-access/{session_id}/end

End a remote access session.

**Purpose:** Clean termination of remote session

**Response:**
```json
{
  "message": "Remote access session ended"
}
```

**Source:** `/src/backend/api/routers/management/remote_access_router.py`
**Used by:** IT Portal Remote Access feature

---

## Scheduled Jobs

### Desktop Session Cleanup

#### Desktop Session Cleanup

- **Frequency:** Every 1 minute
- **Timeout:** 20 minutes (changed from 1440 minutes in Phase 1)
- **Purpose:** Mark sessions inactive if no heartbeat for 20 minutes
- **Handler:** `tasks.maintenance_tasks.cleanup_stale_desktop_sessions_task`
- **Default Args:** `{"timeout_minutes": 20}`

**Behavior:**
- Marks `is_active = false` for sessions with `last_heartbeat < now() - timeout_minutes`
- Soft delete only (retains record for audit)
- Runs frequently (1 min) for timely cleanup

---

#### Desktop Session Hard Delete

- **Frequency:** Daily at 3 AM
- **Retention:** 90 days (configurable)
- **Purpose:** Permanently delete sessions older than 90 days (NEW in Phase 1)
- **Handler:** `tasks.maintenance_tasks.delete_old_desktop_sessions_task`
- **Default Args:** `{"retention_days": 90}`

**Behavior:**
- Hard DELETE (permanent removal from database)
- Deletes sessions where `created_at < now() - retention_days`
- Prevents unbounded table growth
- Complements soft delete cleanup job

---

### Remote Access Cleanup

#### Remote Access Session Cleanup

- **Frequency:** Every 5 minutes
- **Timeout:** 60 minutes
- **Purpose:** Mark orphaned/abandoned remote sessions as ended
- **Handler:** `tasks.remote_access_tasks.cleanup_orphaned_sessions_task`
- **Default Args:** `{"threshold_minutes": 60}`

**Behavior:**
- Ends sessions without heartbeat for > 60 minutes
- Prevents "stuck" sessions from blocking new connections
- Updates session status to appropriate end state

---

### General Maintenance

#### Expired Session Cleanup

- **Frequency:** Daily at 2 AM
- **Retention:** 7 days (configurable)
- **Purpose:** Cleanup expired authentication sessions and tokens
- **Handler:** `tasks.maintenance_tasks.cleanup_expired_sessions_task`
- **Default Args:** `{"retention_days": 7}`

**Behavior:**
- Deletes expired refresh tokens
- Deletes expired web sessions
- Hard DELETE operation

---

#### Deployment Job Cleanup

- **Frequency:** Every 30 minutes
- **Timeout:** 60 minutes
- **Purpose:** Cleanup stale deployment jobs stuck in IN_PROGRESS
- **Handler:** `tasks.maintenance_tasks.cleanup_stale_deployment_jobs_task`
- **Default Args:** `{"timeout_minutes": 60}`

**Behavior:**
- Marks jobs as FAILED if stuck in IN_PROGRESS > 60 minutes
- Allows retry/recovery of stuck deployments

---

## Data Models

### DesktopSession Model

**Table:** `desktop_sessions`

**Purpose:** Track Tauri desktop application sessions for audit and reporting

#### Core Fields

| Field | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| user_id | UUID (FK) | Owner of this session |
| ip_address | string(45) | Client IP address (IPv4 or IPv6) |
| is_active | boolean | Whether session is currently active |
| created_at | datetime | Session creation timestamp |
| last_heartbeat | datetime | Last activity timestamp |

#### Authentication Fields

| Field | Type | Description |
|--------|------|-------------|
| authenticated_at | datetime | When user was authenticated |
| auth_method | string(50) | Authentication method (sso, ad) |
| last_auth_refresh | datetime | Last time auth was refreshed |
| device_fingerprint | string(255) | Unique device identifier |

#### Desktop-Specific Fields

| Field | Type | Description |
|--------|------|-------------|
| app_version | string(50) | Tauri application version (REQUIRED) |
| computer_name | string(255) | Hostname of desktop client |
| os_info | string(100) | Operating system information |

#### DesktopSession Model Fields (Phase 1 Additions)

| Field | Type | Description | Added |
|--------|------|-------------|-------|
| version | int | Optimistic locking version (incremented on each update) | Phase 1 |

**Relationships:**
- `user` → User (many-to-one)

**Indexes:**
- `ix_desktop_sessions_user_id` on `user_id`
- `ix_desktop_sessions_is_active` on `is_active`
- `ix_desktop_sessions_last_heartbeat` on `last_heartbeat`
- `ix_desktop_sessions_created_at` on `created_at`

---

### RemoteAccessSession Model

**Table:** `remote_access_sessions`

**Purpose:** Track remote desktop access sessions for audit

#### Core Fields

| Field | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key, auto-generated |
| request_id | UUID (FK) | Associated support request |
| requester_session_id | UUID (FK) | Requester's DesktopSession |
| agent_id | UUID (FK) | IT agent performing remote access |
| agent_session_id | UUID (FK) | Agent's session (optional) |
| status | enum | PENDING, ACTIVE, ENDED, FAILED |
| started_at | datetime | Session start time |
| ended_at | datetime | Session end time (nullable) |
| last_heartbeat | datetime | Last activity heartbeat |
| connection_type | string | RDP, VNC, etc. |
| failure_reason | string | Reason if status = FAILED |

**Relationships:**
- `request` → ServiceRequest
- `requester_session` → DesktopSession
- `agent` → User
- `agent_session` → DesktopSession

**Indexes:**
- `ix_remote_access_sessions_request_id` on `request_id`
- `ix_remote_access_sessions_requester_session_id` on `requester_session_id`
- `ix_remote_access_sessions_status` on `status`

---

## Configuration

### Presence Settings

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| PRESENCE_HEARTBEAT_INTERVAL_SECONDS | 300 | Desktop app heartbeat interval (seconds) |
| PRESENCE_TTL_SECONDS | 660 | Redis presence key TTL (seconds) |

**Validation:**
- `ttl_seconds >= 2 * heartbeat_interval_seconds`
- Recommended: `ttl_seconds = heartbeat_interval_seconds * 2.2`

**Source:** `/src/backend/core/config.py` (PresenceSettings class)

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-14 | 1.0 | Initial API reference documentation with Phase 1 updates |

---

## Error Rate Monitoring

The system includes comprehensive error tracking using Prometheus metrics. All endpoints in the desktop sessions module now increment error counters when exceptions occur.

### Error Metrics

#### Errors by Type (`errors_total`)

A counter that tracks total errors categorized by type and endpoint.

| Label | Description |
|-------|-------------|
| `error_type` | Type of error (database, redis, validation, service) |
| `endpoint` | API endpoint where error occurred |

**Usage:** Query for specific error types:
```
# Get total database errors
sum(rate(errors_total{error_type="database"}[5m]))

# Get errors by endpoint
sum by (endpoint) (rate(errors_total{}[5m]))
```

#### Error Rate Per Second (`error_rate_per_second`)

A histogram showing the rate of errors per second by type.

| Label | Description |
|-------|-------------|
| `error_type` | Type of error |

**Usage:** Monitor error rates:
```
# Calculate error rate per second
sum by (error_type) (rate(error_rate_per_second{}[5m]))

# Alert if error rate > 1 error per second
sum by (error_type) (rate(error_rate_per_second{}[5m])) > 1
```

#### Error Tracking in Desktop Sessions

All endpoints in `/api/v1/management/desktop-sessions/` now include:

1. **Database Errors** - Track database connection/query failures
2. **Redis Errors** - Track Redis connection/cache failures
3. **Service Errors** - Track business logic failures
4. **Validation Errors** - Track input validation failures

### Error Tracking Implementation

Each endpoint follows this pattern:

```python
try:
    # Business logic
    return result
except Exception as e:
    track_service_error("desktop_sessions/{endpoint}")
    raise HTTPException(status_code=500, detail=str(e))
```

### Metrics Collection

Metrics are automatically collected by the Prometheus client and exposed at:
- Endpoint: `/metrics`
- Format: Prometheus exposition format
- Default port: 9090 (can be configured in core/config.py)

