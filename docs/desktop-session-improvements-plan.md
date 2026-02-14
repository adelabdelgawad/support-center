# Desktop Session Tracking - Improvement Plan

**Document Version:** 1.0
**Created:** 2026-02-14
**Last Updated:** 2026-02-14
**Status:** Planning Phase
**Overall Progress:** 0% (0/35 tasks completed)

---

## Table of Contents

1. [Overview](#overview)
2. [Progress Tracking Instructions](#progress-tracking-instructions)
3. [Phase 1: Critical Fixes](#phase-1-critical-fixes)
4. [Phase 2: Security Enhancements](#phase-2-security-enhancements)
5. [Phase 3: Performance & Scalability](#phase-3-performance--scalability)
6. [Phase 4: Reliability & Resilience](#phase-4-reliability--resilience)
7. [Phase 5: Monitoring & Observability](#phase-5-monitoring--observability)
8. [Testing Strategy](#testing-strategy)
9. [Rollback Plan](#rollback-plan)
10. [Success Metrics](#success-metrics)

---

## Overview

### Purpose

This document outlines the phased improvement plan for the desktop session tracking system based on the comprehensive technical analysis completed on 2026-02-14.

### Scope

- **System:** Desktop session tracking (Tauri requester app + FastAPI backend)
- **Components:** Database, Redis, Heartbeat, Cleanup Jobs, Authentication
- **Timeline:** 4-6 weeks (phased rollout)
- **Priority:** High (addresses critical data accuracy and security issues)

### Key Problems Addressed

1. **Critical:** 24-hour DB cleanup timeout causes stale data (24 hours vs 11-minute Redis TTL)
2. **Critical:** Unbounded table growth (sessions never deleted)
3. **High:** Missing authorization on disconnect endpoint
4. **High:** Configuration drift between frontend/backend intervals
5. **Medium:** Redis single point of failure (no persistence)
6. **Medium:** No distributed locking for cleanup jobs (horizontal scaling issue)

### References

- **Analysis Document:** `/home/adel/.claude/plans/snuggly-brewing-thunder.md`
- **Current Implementation:**
  - Backend Service: `/src/backend/api/services/management/desktop_session_service.py`
  - Frontend Service: `/src/requester-app/src/src/services/session-presence.ts`
  - Router: `/src/backend/api/routers/management/desktop_sessions_router.py`

---

## Progress Tracking Instructions

### How to Update This Document

**CRITICAL:** Every team member working on this plan MUST update progress after completing each task.

### Update Procedure

1. **Mark Task Status:**
   - Change `[ ]` to `[x]` when task is complete
   - Update `Status:` field to current state
   - Add completion date

2. **Update Progress Percentages:**
   - Update phase-level progress: `X% (Y/Z tasks completed)`
   - Update overall progress at top of document

3. **Add Implementation Notes:**
   - Document any deviations from plan
   - Record PR numbers, commit SHAs
   - Note any blockers or issues

4. **Update Last Modified:**
   - Change `Last Updated:` date at top of document
   - Add entry to Change Log section

### Status Values

- `🔴 Not Started` - Task not yet begun
- `🟡 In Progress` - Active development
- `🟢 Complete` - Implemented and verified
- `🔵 Testing` - In QA/testing phase
- `⚫ Blocked` - Waiting on dependency
- `⏸️ Paused` - Temporarily on hold

### Example Entry

```markdown
### Task 1.2: Reduce DB Cleanup Timeout
**Status:** 🟢 Complete
**Assignee:** @developer
**PR:** #1234
**Completed:** 2026-02-15

**Implementation Notes:**
- Changed timeout from 1440 to 20 minutes
- Created migration: `2026_02_15_1000-reduce_cleanup_timeout.py`
- Updated APScheduler job configuration
- Verified cleanup runs successfully in staging

**Deviations from Plan:**
- Used 20 minutes instead of 15 (safer margin)
```

---

## Phase 1: Critical Fixes

**Goal:** Fix data accuracy and prevent unbounded table growth
**Timeline:** Week 1-2
**Priority:** P0 (Must Have)
**Progress:** 0% (0/8 tasks completed)

### Task 1.1: Reduce DB Cleanup Timeout

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Align database cleanup timeout with Redis TTL to prevent stale `is_active = True` sessions persisting for 24 hours.

**Implementation Steps:**

1. **Update Configuration:**
   - File: `/src/backend/db/setup.py`
   - Locate scheduled job: "Desktop Session Cleanup (Every Minute)"
   - Change `task_args: {"timeout_minutes": 1440}` to `task_args: {"timeout_minutes": 20}`
   - Rationale: 20 minutes = 4× heartbeat interval (safe margin)

2. **Create Alembic Migration:**
   ```bash
   cd src/backend
   python -m alembic revision -m "reduce_desktop_session_cleanup_timeout_to_20_minutes"
   ```

3. **Migration SQL:**
   ```sql
   UPDATE scheduled_jobs
   SET task_args = '{"timeout_minutes": 20}'::jsonb
   WHERE name = 'Desktop Session Cleanup (Every Minute)';
   ```

4. **Update Service Documentation:**
   - File: `/src/backend/api/services/management/desktop_session_service.py`
   - Update docstring for `cleanup_stale_sessions()` (line 426)
   - Change default parameter from 1440 to 20

**Verification:**

- [ ] Migration runs successfully
- [ ] Cleanup job executes with new timeout
- [ ] Stale sessions marked inactive within 20 minutes
- [ ] No false positives (active sessions incorrectly marked inactive)

**Rollback:**
```sql
UPDATE scheduled_jobs
SET task_args = '{"timeout_minutes": 1440}'::jsonb
WHERE name = 'Desktop Session Cleanup (Every Minute)';
```

---

### Task 1.2: Add Database Retention Policy (Hard Deletion)

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** Task 1.1 (recommended to complete first)

**Objective:**
Implement automatic hard deletion of sessions older than 90 days to prevent unbounded table growth.

**Implementation Steps:**

1. **Create New Cleanup Task Function:**
   - File: `/src/backend/tasks/maintenance_tasks.py`
   - Add new function:
   ```python
   async def delete_old_desktop_sessions_task(retention_days: int = 90) -> Dict[str, Any]:
       """
       Permanently delete desktop sessions older than retention_days.

       Args:
           retention_days: Number of days to retain sessions (default: 90)

       Returns:
           dict: Deletion statistics
       """
       from datetime import datetime, timedelta
       from api.services.management.desktop_session_service import DesktopSessionService

       async with get_celery_session() as db:
           cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

           # Query sessions older than retention period
           result = await db.execute(
               delete(DesktopSession).where(
                   DesktopSession.created_at < cutoff_date
               ).returning(DesktopSession.id)
           )
           deleted_count = len(result.all())
           await db.commit()

           logger.info(f"Deleted {deleted_count} sessions older than {retention_days} days")

           return {
               "sessions_deleted": deleted_count,
               "cutoff_date": cutoff_date.isoformat(),
               "timestamp": datetime.utcnow().isoformat()
           }
   ```

2. **Create Task Function Entry:**
   - File: `/src/backend/db/setup.py`
   - Add to `task_functions_data`:
   ```python
   {
       "id": "550e8400-e29b-41d4-a716-446655440099",  # Generate new UUID
       "name": "delete_old_desktop_sessions",
       "description": "Delete desktop sessions older than 90 days",
       "handler_path": "tasks.maintenance_tasks.delete_old_desktop_sessions_task",
       "timeout_seconds": 300,
       "is_active": True
   }
   ```

3. **Create Scheduled Job Entry:**
   - Add to `scheduled_jobs_data`:
   ```python
   {
       "id": "550e8400-e29b-41d4-a716-446655440098",  # Generate new UUID
       "name": "Desktop Session Hard Delete (Daily)",
       "description": "Delete sessions older than 90 days (daily at 3 AM)",
       "task_function_name": "delete_old_desktop_sessions",
       "schedule_config": {"hours": 3, "minutes": 0, "seconds": 0},  # 3 AM daily
       "task_args": {"retention_days": 90},
       "timeout_seconds": 300,
       "retry_count": 3,
       "retry_delay_seconds": 300,
       "is_active": True
   }
   ```

4. **Create Migration:**
   ```bash
   python -m alembic revision -m "add_desktop_session_hard_delete_job"
   ```

**Verification:**

- [ ] New task function is registered in database
- [ ] Scheduled job runs daily at 3 AM
- [ ] Sessions older than 90 days are deleted
- [ ] Recent sessions (< 90 days) are preserved
- [ ] Table size stabilizes over time

**Monitoring:**
- Track table size: `SELECT pg_size_pretty(pg_total_relation_size('desktop_sessions'));`
- Monitor deletion counts in task execution logs

---

### Task 1.3: Add Session Expiration Guard (Prevent Resurrection)

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** Task 1.1

**Objective:**
Prevent inactive sessions from being "resurrected" by stale clients sending heartbeats.

**Implementation Steps:**

1. **Update Repository Method:**
   - File: `/src/backend/api/repositories/management/desktop_session_repository.py`
   - Modify `update_heartbeat()`:
   ```python
   async def update_heartbeat(
       self,
       session_id: UUID,
       ip_address: Optional[str] = None
   ) -> Optional[DesktopSession]:
       """
       Update heartbeat for active session.
       Rejects heartbeats for sessions inactive > 1 hour.
       """
       stmt = select(DesktopSession).where(DesktopSession.id == session_id)
       result = await self.session.execute(stmt)
       session = result.scalar_one_or_none()

       if not session:
           return None

       # GUARD: Reject resurrection if inactive for > 1 hour
       if not session.is_active:
           inactive_duration = (datetime.utcnow() - session.last_heartbeat).total_seconds() / 60
           if inactive_duration > 60:  # 1 hour threshold
               logger.warning(
                   f"Rejected heartbeat for long-inactive session {session_id} "
                   f"(inactive for {inactive_duration:.1f} minutes)"
               )
               return None

       # Update heartbeat
       session.last_heartbeat = datetime.utcnow()
       session.is_active = True
       if ip_address:
           session.ip_address = ip_address

       await self.session.flush()
       return session
   ```

2. **Update Router to Handle None:**
   - File: `/src/backend/api/routers/management/desktop_sessions_router.py`
   - Modify heartbeat endpoint (lines 270-319):
   ```python
   session = await DesktopSessionService.update_heartbeat(
       db=db, session_id=session_id, ip_address=ip_address
   )

   if not session:
       raise HTTPException(
           status_code=410,  # Gone
           detail="Session has expired and cannot be reactivated. Please create a new session."
       )
   ```

3. **Update Frontend Handling:**
   - File: `/src/requester-app/src/src/services/session-presence.ts`
   - Update `sendHeartbeat()` (lines 151-176):
   ```typescript
   else if (response.status === 410) {
       // Session expired and rejected
       console.warn('[SessionPresence] Session expired, stopping presence');
       this.stop(false);
   }
   ```

**Verification:**

- [ ] Active sessions continue to receive heartbeats normally
- [ ] Sessions inactive < 1 hour can be reactivated
- [ ] Sessions inactive > 1 hour return 410 Gone
- [ ] Client stops heartbeat timer on 410 response
- [ ] No zombie sessions in database after 24 hours

---

### Task 1.4: Add Optimistic Locking (Prevent Race Conditions)

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** None

**Objective:**
Add version field to detect and prevent concurrent heartbeat race conditions.

**Implementation Steps:**

1. **Add Version Column:**
   - Create migration:
   ```bash
   python -m alembic revision -m "add_version_to_desktop_sessions"
   ```

2. **Migration SQL:**
   ```sql
   ALTER TABLE desktop_sessions
   ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

   CREATE INDEX ix_desktop_sessions_version ON desktop_sessions(version);
   ```

3. **Update Model:**
   - File: `/src/backend/db/models.py`
   - Add to `DesktopSession` class (after `last_heartbeat`):
   ```python
   version: int = Field(
       default=1,
       sa_column=Column(Integer, nullable=False, server_default="1"),
       description="Optimistic locking version (incremented on each update)"
   )
   ```

4. **Update Repository:**
   - File: `/src/backend/api/repositories/management/desktop_session_repository.py`
   - Modify `update_heartbeat()`:
   ```python
   async def update_heartbeat(
       self,
       session_id: UUID,
       ip_address: Optional[str] = None
   ) -> Optional[DesktopSession]:
       """Update heartbeat with optimistic locking."""
       # Get current session with version
       stmt = select(DesktopSession).where(DesktopSession.id == session_id)
       result = await self.session.execute(stmt)
       session = result.scalar_one_or_none()

       if not session:
           return None

       current_version = session.version

       # Update with version check
       session.last_heartbeat = datetime.utcnow()
       session.is_active = True
       session.version = current_version + 1
       if ip_address:
           session.ip_address = ip_address

       # Flush will raise exception if version changed
       try:
           await self.session.flush()
       except Exception as e:
           logger.warning(f"Optimistic lock failure for session {session_id}: {e}")
           await self.session.rollback()
           return None

       return session
   ```

**Verification:**

- [ ] Migration applies successfully
- [ ] Version increments on each heartbeat
- [ ] Concurrent heartbeats handled gracefully (one succeeds, others fail)
- [ ] No data corruption under concurrent load

**Testing:**
- Simulate concurrent heartbeats from same session
- Verify only one update succeeds
- Verify failed updates don't crash

---

### Task 1.5: Centralize Interval Configuration

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

**Objective:**
Move heartbeat interval to backend configuration to prevent frontend/backend drift.

**Implementation Steps:**

1. **Add Backend Configuration:**
   - File: `/src/backend/core/config.py`
   - Update `PresenceSettings` class:
   ```python
   class PresenceSettings(BaseSettings):
       """Redis TTL-based presence tracking configuration."""

       heartbeat_interval_seconds: int = Field(
           default=300,  # 5 minutes
           description="Desktop app heartbeat interval in seconds",
       )

       ttl_seconds: int = Field(
           default=660,
           description="TTL for presence keys in Redis. Should be ~2x heartbeat_interval_seconds.",
       )

       @field_validator('ttl_seconds')
       @classmethod
       def validate_ttl(cls, v, info):
           """Ensure TTL is at least 2x heartbeat interval."""
           heartbeat = info.data.get('heartbeat_interval_seconds', 300)
           if v < heartbeat * 2:
               raise ValueError(
                   f"ttl_seconds ({v}) must be at least 2x heartbeat_interval_seconds ({heartbeat}). "
                   f"Recommended: {heartbeat * 2.2:.0f} seconds"
               )
           return v
   ```

2. **Add Configuration Endpoint:**
   - File: `/src/backend/api/routers/management/desktop_sessions_router.py`
   - Add new endpoint:
   ```python
   @router.get("/config", response_model=dict)
   async def get_desktop_session_config():
       """
       Get desktop session configuration.
       Used by Tauri app to sync heartbeat interval.
       """
       from core.config import settings

       return {
           "heartbeatIntervalMs": settings.presence.heartbeat_interval_seconds * 1000,
           "heartbeatIntervalSeconds": settings.presence.heartbeat_interval_seconds,
           "redisTtlSeconds": settings.presence.ttl_seconds,
       }
   ```

3. **Update Frontend to Fetch Config:**
   - File: `/src/requester-app/src/src/services/session-presence.ts`
   - Add config fetch on initialization:
   ```typescript
   class SessionPresenceService {
       private heartbeatIntervalMs: number = 300000;  // Default 5 min

       async initialize(): Promise<void> {
           try {
               const apiUrl = RuntimeConfig.getServerAddress();
               const response = await tauriFetch(`${apiUrl}/sessions/desktop/config`);

               if (response.ok) {
                   const config = await response.json();
                   this.heartbeatIntervalMs = config.heartbeatIntervalMs;
                   console.log(`[SessionPresence] Using server config: ${this.heartbeatIntervalMs}ms`);
               }
           } catch (error) {
               console.warn('[SessionPresence] Failed to fetch config, using default');
           }
       }

       start(): void {
           // Use this.heartbeatIntervalMs instead of constant
           this.heartbeatTimer = setInterval(() => {
               this.sendHeartbeat();
           }, this.heartbeatIntervalMs);
       }
   }
   ```

4. **Update Environment Variable:**
   - File: `/src/backend/.env.example`
   - Add:
   ```env
   PRESENCE_HEARTBEAT_INTERVAL_SECONDS=300  # 5 minutes
   PRESENCE_TTL_SECONDS=660  # 11 minutes (2.2x heartbeat)
   ```

**Verification:**

- [ ] Backend config endpoint returns correct values
- [ ] Frontend fetches config on app start
- [ ] Heartbeat interval matches backend configuration
- [ ] Changing backend config affects frontend behavior
- [ ] Validator prevents TTL < 2× heartbeat

---

### Task 1.6: Document Configuration Relationships

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 1 hour
**Dependencies:** Task 1.5

**Objective:**
Add clear documentation of interval relationships and formulas.

**Implementation Steps:**

1. **Update Backend Configuration:**
   - File: `/src/backend/core/config.py`
   - Add comprehensive docstring to `PresenceSettings`:
   ```python
   class PresenceSettings(BaseSettings):
       """
       Redis TTL-based presence tracking configuration.

       INTERVAL RELATIONSHIPS:
       =======================

       heartbeat_interval_seconds (client → server):
           - How often Tauri app sends heartbeat to backend
           - Default: 300 seconds (5 minutes)
           - Lower = more accurate presence, higher backend load
           - Higher = less backend load, longer gap before offline detection

       ttl_seconds (Redis key expiration):
           - How long Redis keeps presence keys without refresh
           - MUST be >= 2x heartbeat_interval_seconds
           - Recommended: 2.2x heartbeat interval (safety margin)
           - Default: 660 seconds (11 minutes = 2.2 × 300)
           - Allows 1 missed heartbeat before offline

       cleanup_timeout_minutes (DB hygiene):
           - How long before marking session inactive in database
           - Recommended: 4x heartbeat_interval_seconds
           - Default: 20 minutes (4 × 5 minutes)
           - Purpose: Database hygiene only, Redis is authoritative

       EXAMPLE CONFIGURATIONS:
       =======================

       Conservative (low backend load):
           heartbeat_interval_seconds = 300 (5 min)
           ttl_seconds = 660 (11 min)
           cleanup_timeout_minutes = 20 (20 min)

       Aggressive (accurate presence):
           heartbeat_interval_seconds = 120 (2 min)
           ttl_seconds = 264 (4.4 min)
           cleanup_timeout_minutes = 8 (8 min)

       NEVER DO THIS (will cause false negatives):
           heartbeat_interval_seconds = 300
           ttl_seconds = 400  # Too low! < 2x heartbeat
       """
   ```

2. **Add README Section:**
   - File: `/docs/desktop-session-tracking.md` (create new)
   - Add configuration guide with examples

3. **Update CLAUDE.md:**
   - File: `/CLAUDE.md`
   - Add section under "Desktop Session Tracking" with interval relationships

**Verification:**

- [ ] Documentation is clear and comprehensive
- [ ] Examples are correct and tested
- [ ] Relationships are explained with formulas
- [ ] Warnings about invalid configurations included

---

### Task 1.7: Add Configuration Validation Tests

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** Task 1.5

**Objective:**
Ensure configuration validator catches invalid settings.

**Implementation Steps:**

1. **Create Test File:**
   - File: `/src/backend/tests/test_presence_config.py`
   ```python
   import pytest
   from pydantic import ValidationError
   from core.config import PresenceSettings

   def test_valid_ttl_configuration():
       """TTL should be at least 2x heartbeat interval."""
       config = PresenceSettings(
           heartbeat_interval_seconds=300,
           ttl_seconds=660
       )
       assert config.ttl_seconds == 660

   def test_invalid_ttl_too_low():
       """TTL < 2x heartbeat should raise validation error."""
       with pytest.raises(ValidationError) as exc:
           PresenceSettings(
               heartbeat_interval_seconds=300,
               ttl_seconds=500  # < 2 × 300
           )
       assert "must be at least 2x heartbeat_interval_seconds" in str(exc.value)

   def test_ttl_exactly_2x_heartbeat():
       """TTL exactly 2x heartbeat should be valid (minimum)."""
       config = PresenceSettings(
           heartbeat_interval_seconds=300,
           ttl_seconds=600  # Exactly 2x
       )
       assert config.ttl_seconds == 600

   def test_aggressive_configuration():
       """Test aggressive (2-minute heartbeat) configuration."""
       config = PresenceSettings(
           heartbeat_interval_seconds=120,
           ttl_seconds=264
       )
       assert config.heartbeat_interval_seconds == 120
       assert config.ttl_seconds == 264
   ```

2. **Run Tests:**
   ```bash
   cd src/backend
   uv run pytest tests/test_presence_config.py -v
   ```

**Verification:**

- [ ] All tests pass
- [ ] Invalid configurations are rejected
- [ ] Valid configurations are accepted
- [ ] Error messages are clear

---

### Task 1.8: Update Backend API Documentation

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 1 hour
**Dependencies:** Tasks 1.1-1.7

**Objective:**
Document all changes in the backend API reference.

**Implementation Steps:**

1. **Update API Reference:**
   - File: `/docs/backend-api-reference.md`
   - Add section for desktop session configuration:
   ```markdown
   ### Desktop Session Configuration

   #### GET /sessions/desktop/config
   Get desktop session configuration (heartbeat interval, Redis TTL).

   **Response:**
   ```json
   {
       "heartbeatIntervalMs": 300000,
       "heartbeatIntervalSeconds": 300,
       "redisTtlSeconds": 660
   }
   ```

   #### POST /sessions/desktop/{session_id}/heartbeat
   Update session heartbeat.

   **Changed Behavior (Phase 1):**
   - Returns 410 Gone if session inactive > 1 hour (prevents resurrection)
   - Uses optimistic locking to prevent race conditions

   **Response Codes:**
   - 200: Heartbeat updated successfully
   - 404: Session not found
   - 410: Session expired (inactive > 1 hour)
   - 403: Not authorized (ownership verification failed)
   ```

2. **Document Scheduled Jobs:**
   ```markdown
   ### Scheduled Jobs (Updated Phase 1)

   #### Desktop Session Cleanup
   - **Frequency:** Every 1 minute
   - **Timeout:** 20 minutes (changed from 1440 minutes)
   - **Purpose:** Mark sessions inactive if no heartbeat for 20 minutes

   #### Desktop Session Hard Delete
   - **Frequency:** Daily at 3 AM
   - **Retention:** 90 days (configurable)
   - **Purpose:** Permanently delete sessions older than 90 days
   ```

**Verification:**

- [ ] API reference is complete and accurate
- [ ] All new endpoints documented
- [ ] Changed behavior clearly marked
- [ ] Examples provided

---

## Phase 2: Security Enhancements

**Goal:** Strengthen authentication, authorization, and prevent abuse
**Timeline:** Week 3
**Priority:** P1 (High)
**Progress:** 0% (0/7 tasks completed)

### Task 2.1: Add Ownership Validation to Disconnect Endpoint

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Prevent users from disconnecting other users' sessions (security vulnerability).

**Implementation Steps:**

1. **Update Router:**
   - File: `/src/backend/api/routers/management/desktop_sessions_router.py`
   - Modify disconnect endpoint (lines 322-368):
   ```python
   @router.post("/{session_id}/disconnect", status_code=200)
   async def disconnect_desktop_session(
       session_id: UUID = Depends(validate_session_uuid),
       db: AsyncSession = Depends(get_session),
       current_user: User = Depends(get_optional_user),  # Add auth
       force: bool = False
   ):
       """
       Mark a desktop session as disconnected.

       SECURITY: Regular users can only disconnect their own sessions.
       Admins can force disconnect any session with force=True.
       """
       # Get session
       session = await DesktopSessionService.get_session_by_id(db=db, session_id=session_id)

       if not session:
           raise HTTPException(404, "Desktop session not found")

       # SECURITY: Verify ownership or admin
       if current_user:
           is_owner = session.user_id == current_user.id
           is_admin = current_user.is_super_admin

           if not is_owner and not is_admin:
               logger.warning(
                   f"Disconnect rejected: user {current_user.id} tried to disconnect "
                   f"session {session_id} owned by user {session.user_id}"
               )
               raise HTTPException(403, "Not authorized to disconnect this session")

           # Only admins can force disconnect
           if force and not is_admin:
               raise HTTPException(403, "Only administrators can force disconnect")

       # Disconnect session
       session = await DesktopSessionService.disconnect_session(db=db, session_id=session_id)

       # ... rest of existing code for SignalR notification ...
   ```

**Verification:**

- [ ] Users can disconnect their own sessions
- [ ] Users cannot disconnect other users' sessions (403)
- [ ] Admins can disconnect any session
- [ ] Admins can use force=True
- [ ] Non-admins cannot use force=True

**Security Test:**
```bash
# User A tries to disconnect User B's session
curl -X POST https://api.example.com/sessions/desktop/{user_b_session_id}/disconnect \
  -H "Authorization: Bearer <user_a_jwt>" \
  # Should return 403 Forbidden
```

---

### Task 2.2: Add Rate Limiting to Session Creation

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

**Objective:**
Prevent abuse by limiting session creation rate per user.

**Implementation Steps:**

1. **Add Rate Limiter Dependency:**
   - File: `/src/backend/core/dependencies.py`
   - Add session creation rate limiter:
   ```python
   from slowapi import Limiter
   from slowapi.util import get_remote_address

   session_creation_limiter = Limiter(
       key_func=get_remote_address,
       default_limits=["10 per minute"]
   )
   ```

2. **Apply Rate Limit:**
   - File: Authentication router (where session creation happens)
   - Add rate limit decorator:
   ```python
   from core.dependencies import session_creation_limiter

   @router.post("/login")
   @session_creation_limiter.limit("5 per minute")  # 5 logins per minute per IP
   async def login(...):
       # ... existing code ...
       # Session creation happens here
   ```

3. **Add Configuration:**
   - File: `/src/backend/core/config.py`
   - Add rate limit settings:
   ```python
   class SecuritySettings(BaseSettings):
       # ... existing fields ...

       session_creation_rate_limit: str = Field(
           default="5 per minute",
           description="Rate limit for session creation per IP address"
       )

       session_max_concurrent: int = Field(
           default=5,  # Changed from 0 (unlimited)
           description="Maximum concurrent sessions per user (0 = unlimited)"
       )
   ```

4. **Update Service:**
   - File: `/src/backend/api/services/management/desktop_session_service.py`
   - Use dynamic configuration (lines 209):
   ```python
   max_concurrent = settings.security.session_max_concurrent
   # ... existing logic uses this value ...
   ```

**Verification:**

- [ ] Rate limit enforced (6th request in 1 minute returns 429)
- [ ] Rate limit resets after 1 minute
- [ ] Legitimate users not affected
- [ ] Concurrent session limit enforced

**Testing:**
```bash
# Rapid session creation (should fail after 5)
for i in {1..10}; do
  curl -X POST https://api.example.com/auth/login -d '{"username": "test", "password": "test"}'
done
# Requests 6-10 should return 429 Too Many Requests
```

---

### Task 2.3: Add IP Address Validation

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Validate IP address updates match request IP to prevent spoofing.

**Implementation Steps:**

1. **Add IP Extraction Utility:**
   - File: `/src/backend/core/utils/network.py` (create new)
   ```python
   from fastapi import Request
   from typing import Optional

   def get_client_ip(request: Request) -> str:
       """
       Extract client IP from request.
       Checks X-Forwarded-For header (from reverse proxy) first.
       """
       # Check X-Forwarded-For header (from nginx/reverse proxy)
       forwarded = request.headers.get("X-Forwarded-For")
       if forwarded:
           # Take first IP (client IP, not proxy)
           return forwarded.split(",")[0].strip()

       # Fallback to direct connection IP
       if request.client:
           return request.client.host

       return "unknown"
   ```

2. **Update Heartbeat Endpoint:**
   - File: `/src/backend/api/routers/management/desktop_sessions_router.py`
   - Modify heartbeat endpoint:
   ```python
   from core.utils.network import get_client_ip
   from fastapi import Request

   @router.post("/{session_id}/heartbeat", response_model=DesktopSessionRead)
   async def update_desktop_heartbeat(
       request: Request,  # Add request
       session_id: UUID = Depends(validate_session_uuid),
       ip_address: Optional[str] = None,  # Deprecated, use request IP
       db: AsyncSession = Depends(get_session),
       current_user: User = Depends(get_optional_user),
   ):
       # ... existing ownership validation ...

       # Use request IP instead of client-provided IP
       request_ip = get_client_ip(request)

       # Optional: Log warning if client provides different IP
       if ip_address and ip_address != request_ip:
           logger.warning(
               f"IP mismatch for session {session_id}: "
               f"client claimed {ip_address}, request from {request_ip}"
           )

       # Update heartbeat with verified IP
       session = await DesktopSessionService.update_heartbeat(
           db=db, session_id=session_id, ip_address=request_ip
       )

       return session
   ```

**Verification:**

- [ ] Request IP extracted correctly from X-Forwarded-For
- [ ] Heartbeat updates use request IP (not client-provided)
- [ ] Warning logged if client IP mismatches
- [ ] Audit trail shows accurate IP addresses

---

### Task 2.4: Add Session Fingerprint Validation

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

**Objective:**
Detect and prevent session hijacking by validating device fingerprint consistency.

**Implementation Steps:**

1. **Add Fingerprint Validation:**
   - File: `/src/backend/api/services/management/desktop_session_service.py`
   - Add validation method:
   ```python
   @staticmethod
   async def validate_session_fingerprint(
       db: AsyncSession,
       session_id: UUID,
       provided_fingerprint: Optional[str]
   ) -> tuple[bool, Optional[str]]:
       """
       Validate that provided fingerprint matches session's stored fingerprint.

       Returns:
           (is_valid, reason)
       """
       session = await DesktopSessionRepository.find_by_id(db, session_id)

       if not session:
           return (False, "Session not found")

       # Allow sessions without stored fingerprint (legacy)
       if not session.device_fingerprint:
           return (True, None)

       # Allow heartbeats without fingerprint (backward compatibility)
       if not provided_fingerprint:
           logger.warning(
               f"Heartbeat for session {session_id} without fingerprint "
               f"(expected: {session.device_fingerprint})"
           )
           return (True, "No fingerprint provided")

       # Validate fingerprint match
       if session.device_fingerprint != provided_fingerprint:
           logger.error(
               f"Fingerprint mismatch for session {session_id}: "
               f"stored={session.device_fingerprint}, provided={provided_fingerprint}"
           )
           return (False, "Device fingerprint mismatch (possible session hijacking)")

       return (True, None)
   ```

2. **Update Heartbeat Schema:**
   - File: `/src/backend/api/schemas/desktop_session.py`
   - Add optional fingerprint field:
   ```python
   class DesktopSessionHeartbeatRequest(CamelModel):
       """Heartbeat request with optional fingerprint validation."""
       device_fingerprint: Optional[str] = None
   ```

3. **Update Heartbeat Endpoint:**
   - File: `/src/backend/api/routers/management/desktop_sessions_router.py`
   ```python
   @router.post("/{session_id}/heartbeat", response_model=DesktopSessionRead)
   async def update_desktop_heartbeat(
       request: Request,
       session_id: UUID = Depends(validate_session_uuid),
       heartbeat_data: DesktopSessionHeartbeatRequest = Body(default=None),
       db: AsyncSession = Depends(get_session),
       current_user: User = Depends(get_optional_user),
   ):
       # ... existing ownership validation ...

       # Validate fingerprint if provided
       if heartbeat_data and heartbeat_data.device_fingerprint:
           is_valid, reason = await DesktopSessionService.validate_session_fingerprint(
               db, session_id, heartbeat_data.device_fingerprint
           )

           if not is_valid:
               logger.critical(
                   f"SECURITY: Possible session hijacking detected for session {session_id} "
                   f"by user {current_user.id if current_user else 'unknown'}: {reason}"
               )
               raise HTTPException(403, f"Session validation failed: {reason}")

       # ... rest of existing code ...
   ```

4. **Update Frontend:**
   - File: `/src/requester-app/src/src/services/session-presence.ts`
   - Include fingerprint in heartbeat:
   ```typescript
   private async sendHeartbeat(): Promise<void> {
       const sessionId = getValidatedSessionId();
       const token = authStore.state.token;
       const fingerprint = authStore.state.deviceFingerprint;  // Add this

       const response = await tauriFetch(`${apiUrl}/sessions/desktop/${sessionId}/heartbeat`, {
           method: 'POST',
           headers: {
               'Authorization': `Bearer ${token}`,
               'Content-Type': 'application/json',
           },
           body: JSON.stringify({
               deviceFingerprint: fingerprint  // Include in request
           })
       });
   }
   ```

**Verification:**

- [ ] Heartbeats with correct fingerprint succeed
- [ ] Heartbeats with wrong fingerprint fail (403)
- [ ] Critical security log generated on mismatch
- [ ] Legacy sessions (no fingerprint) still work
- [ ] Alert generated for security team

---

### Task 2.5: Add Geolocation Anomaly Detection

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** Task 2.3

**Objective:**
Detect suspicious activity when session IP changes to different country.

**Implementation Steps:**

1. **Add GeoIP Library:**
   - File: `/src/backend/pyproject.toml`
   - Add dependency:
   ```toml
   dependencies = [
       # ... existing ...
       "geoip2>=4.7.0",
   ]
   ```

2. **Download MaxMind GeoLite2:**
   ```bash
   # Download free GeoLite2 database
   mkdir -p /data/geoip
   wget https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb -O /data/geoip/GeoLite2-City.mmdb
   ```

3. **Add Geolocation Service:**
   - File: `/src/backend/api/services/geolocation_service.py` (create new)
   ```python
   import geoip2.database
   import geoip2.errors
   from typing import Optional, Tuple
   import logging

   logger = logging.getLogger(__name__)

   class GeolocationService:
       def __init__(self, db_path: str = "/data/geoip/GeoLite2-City.mmdb"):
           self.reader = geoip2.database.Reader(db_path)

       def get_country(self, ip_address: str) -> Optional[str]:
           """Get country code from IP address."""
           try:
               response = self.reader.city(ip_address)
               return response.country.iso_code
           except geoip2.errors.AddressNotFoundError:
               return None
           except Exception as e:
               logger.warning(f"Geolocation lookup failed for {ip_address}: {e}")
               return None

       def is_country_change(self, old_ip: str, new_ip: str) -> Tuple[bool, Optional[str], Optional[str]]:
           """
           Check if IP change represents country change.

           Returns:
               (is_change, old_country, new_country)
           """
           old_country = self.get_country(old_ip)
           new_country = self.get_country(new_ip)

           if old_country and new_country and old_country != new_country:
               return (True, old_country, new_country)

           return (False, old_country, new_country)

   # Global instance
   geo_service = GeolocationService()
   ```

4. **Add Anomaly Detection:**
   - File: `/src/backend/api/services/management/desktop_session_service.py`
   - Add to `update_heartbeat()`:
   ```python
   from api.services.geolocation_service import geo_service

   async def update_heartbeat(db, session_id, ip_address=None):
       session = await DesktopSessionRepository.update_heartbeat(db, session_id, ip_address)

       if not session:
           return None

       # Check for country change (anomaly detection)
       if ip_address and session.ip_address != ip_address:
           is_change, old_country, new_country = geo_service.is_country_change(
               session.ip_address, ip_address
           )

           if is_change:
               logger.warning(
                   f"SECURITY: Country change detected for session {session_id} "
                   f"(user {session.user_id}): {old_country} → {new_country} "
                   f"(old IP: {session.ip_address}, new IP: {ip_address})"
               )

               # Optional: Send notification to user
               # await notify_user_of_location_change(session.user_id, old_country, new_country)

       # ... rest of existing code ...
   ```

**Verification:**

- [ ] GeoIP database loaded successfully
- [ ] Country lookup works for valid IPs
- [ ] Country changes are detected and logged
- [ ] No false positives (same country moves)
- [ ] Warnings visible in security logs

**Note:** This is detection only, not blocking. Consider adding user notification in future phase.

---

### Task 2.6: Add Session Audit Logging

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

**Objective:**
Enhance audit trail with security-relevant session events.

**Implementation Steps:**

1. **Add Audit Event Types:**
   - File: `/src/backend/db/models.py`
   - Add to audit event type enum (if exists) or create:
   ```python
   class AuditEventType(str, Enum):
       # ... existing types ...
       SESSION_CREATED = "session_created"
       SESSION_HEARTBEAT = "session_heartbeat"
       SESSION_DISCONNECTED = "session_disconnected"
       SESSION_EXPIRED = "session_expired"
       SESSION_FINGERPRINT_MISMATCH = "session_fingerprint_mismatch"
       SESSION_COUNTRY_CHANGE = "session_country_change"
       SESSION_HIJACK_ATTEMPT = "session_hijack_attempt"
   ```

2. **Create Audit Helper:**
   - File: `/src/backend/api/services/audit_service.py`
   - Add session audit methods:
   ```python
   class AuditService:
       @staticmethod
       async def log_session_event(
           db: AsyncSession,
           event_type: str,
           session_id: UUID,
           user_id: UUID,
           details: dict
       ):
           """Log session-related security event."""
           audit_entry = AuditLog(
               event_type=event_type,
               user_id=user_id,
               resource_type="desktop_session",
               resource_id=str(session_id),
               details=details,
               ip_address=details.get("ip_address"),
               timestamp=datetime.utcnow()
           )
           db.add(audit_entry)
           await db.flush()
   ```

3. **Add Audit Calls:**
   - Update desktop session service to log critical events:
   ```python
   # On fingerprint mismatch (Task 2.4)
   await AuditService.log_session_event(
       db, "session_fingerprint_mismatch", session_id, session.user_id,
       {"expected": session.device_fingerprint, "received": provided_fingerprint}
   )

   # On country change (Task 2.5)
   await AuditService.log_session_event(
       db, "session_country_change", session_id, session.user_id,
       {"old_country": old_country, "new_country": new_country, "old_ip": old_ip, "new_ip": new_ip}
   )
   ```

**Verification:**

- [ ] Audit logs created for all security events
- [ ] Audit logs searchable by session_id
- [ ] Audit logs include relevant details
- [ ] Audit trail immutable (append-only)

---

### Task 2.7: Add Security Metrics Dashboard

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** Tasks 2.1-2.6

**Objective:**
Create monitoring endpoint for security metrics.

**Implementation Steps:**

1. **Add Metrics Endpoint:**
   - File: `/src/backend/api/routers/management/desktop_sessions_router.py`
   ```python
   @router.get("/security/metrics")
   async def get_security_metrics(
       db: AsyncSession = Depends(get_session),
       current_user: User = Depends(get_current_admin_user)  # Admin only
   ):
       """
       Get desktop session security metrics.
       Admin endpoint for monitoring security events.
       """
       from datetime import datetime, timedelta

       last_24h = datetime.utcnow() - timedelta(hours=24)

       # Query audit logs for security events
       fingerprint_mismatches = await db.scalar(
           select(func.count()).select_from(AuditLog).where(
               AuditLog.event_type == "session_fingerprint_mismatch",
               AuditLog.timestamp >= last_24h
           )
       )

       country_changes = await db.scalar(
           select(func.count()).select_from(AuditLog).where(
               AuditLog.event_type == "session_country_change",
               AuditLog.timestamp >= last_24h
           )
       )

       failed_auth = await db.scalar(
           select(func.count()).select_from(AuditLog).where(
               AuditLog.event_type.in_(["session_hijack_attempt", "session_fingerprint_mismatch"]),
               AuditLog.timestamp >= last_24h
           )
       )

       return {
           "period": "last_24_hours",
           "fingerprintMismatches": fingerprint_mismatches,
           "countryChanges": country_changes,
           "failedAuthAttempts": failed_auth,
           "timestamp": datetime.utcnow().isoformat()
       }
   ```

**Verification:**

- [ ] Metrics endpoint returns correct counts
- [ ] Only admins can access endpoint
- [ ] Metrics update in real-time
- [ ] Dashboard displays metrics clearly

---

## Phase 3: Performance & Scalability

**Goal:** Optimize for horizontal scaling and high load
**Timeline:** Week 3-4
**Priority:** P2 (Medium)
**Progress:** 0% (0/6 tasks completed)

### Task 3.1: Add Redis Persistence

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Enable Redis persistence to survive server restarts without losing presence data.

**Implementation Steps:**

1. **Update Redis Configuration:**
   - File: `/docker/redis/redis.conf` (create if not exists)
   ```conf
   # Enable AOF (Append-Only File) persistence
   appendonly yes
   appendfilename "appendonly.aof"

   # AOF sync policy: fsync every second (good balance)
   appendfsync everysec

   # RDB snapshots (backup)
   save 900 1      # Save if 1 key changed in 15 minutes
   save 300 10     # Save if 10 keys changed in 5 minutes
   save 60 10000   # Save if 10000 keys changed in 1 minute

   # Persistence directory
   dir /data
   ```

2. **Update Docker Compose:**
   - File: `/docker-compose.yml`
   ```yaml
   services:
     redis:
       image: redis:7-alpine
       command: redis-server /usr/local/etc/redis/redis.conf
       volumes:
         - redis_data:/data
         - ./docker/redis/redis.conf:/usr/local/etc/redis/redis.conf:ro
       ports:
         - "6380:6379"

   volumes:
     redis_data:
       driver: local
   ```

**Verification:**

- [ ] Redis restarts preserve presence keys
- [ ] AOF file created in /data
- [ ] No significant performance impact
- [ ] Presence data survives container restarts

**Testing:**
```bash
# Set presence key
redis-cli SET presence:desktop:test-uuid user-123 EX 660

# Restart Redis
docker-compose restart redis

# Check key still exists
redis-cli GET presence:desktop:test-uuid
# Should return: user-123
```

---

### Task 3.2: Add Distributed Lock for Cleanup Job

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

**Objective:**
Prevent multiple backend instances from running cleanup job simultaneously.

**Implementation Steps:**

1. **Add Redis Lock Utility:**
   - File: `/src/backend/core/utils/distributed_lock.py` (create new)
   ```python
   import asyncio
   import logging
   from typing import Optional
   from uuid import uuid4

   logger = logging.getLogger(__name__)

   class DistributedLock:
       """Redis-based distributed lock for preventing duplicate job execution."""

       def __init__(self, redis_client, lock_name: str, timeout_seconds: int = 60):
           self.redis = redis_client
           self.lock_name = f"lock:{lock_name}"
           self.timeout_seconds = timeout_seconds
           self.lock_id = str(uuid4())

       async def acquire(self) -> bool:
           """
           Attempt to acquire lock.
           Returns True if acquired, False if already held.
           """
           result = await self.redis.set(
               self.lock_name,
               self.lock_id,
               nx=True,  # Only set if not exists
               ex=self.timeout_seconds
           )

           if result:
               logger.info(f"Acquired lock: {self.lock_name} (ID: {self.lock_id})")
               return True
           else:
               logger.debug(f"Lock already held: {self.lock_name}")
               return False

       async def release(self):
           """Release lock if we own it."""
           # Lua script for atomic get-and-delete-if-match
           lua_script = """
           if redis.call("get", KEYS[1]) == ARGV[1] then
               return redis.call("del", KEYS[1])
           else
               return 0
           end
           """

           result = await self.redis.eval(lua_script, 1, self.lock_name, self.lock_id)

           if result:
               logger.info(f"Released lock: {self.lock_name} (ID: {self.lock_id})")
           else:
               logger.warning(f"Failed to release lock (not owner): {self.lock_name}")

       async def __aenter__(self):
           acquired = await self.acquire()
           if not acquired:
               raise LockNotAcquired(f"Could not acquire lock: {self.lock_name}")
           return self

       async def __aexit__(self, exc_type, exc_val, exc_tb):
           await self.release()

   class LockNotAcquired(Exception):
       pass
   ```

2. **Update Cleanup Task:**
   - File: `/src/backend/tasks/maintenance_tasks.py`
   ```python
   from core.utils.distributed_lock import DistributedLock, LockNotAcquired
   import redis.asyncio as redis
   from core.config import settings

   async def cleanup_stale_desktop_sessions_task(timeout_minutes: int = 20) -> Dict[str, Any]:
       """Cleanup with distributed lock."""

       # Create Redis client for locking
       redis_client = redis.Redis.from_url(
           settings.redis.url,
           decode_responses=True
       )

       try:
           # Try to acquire lock (60-second timeout)
           async with DistributedLock(redis_client, "cleanup_desktop_sessions", timeout_seconds=60):
               # Lock acquired - run cleanup
               async with get_celery_session() as db:
                   count = await DesktopSessionService.cleanup_stale_sessions(
                       db, timeout_minutes=timeout_minutes
                   )

                   logger.info(f"Cleanup completed: {count} sessions marked inactive")

                   return {
                       "sessions_marked_inactive": count,
                       "timestamp": datetime.utcnow().isoformat()
                   }

       except LockNotAcquired:
           logger.info("Cleanup lock already held by another instance, skipping")
           return {
               "sessions_marked_inactive": 0,
               "timestamp": datetime.utcnow().isoformat(),
               "skipped": True,
               "reason": "Lock held by another instance"
           }

       finally:
           await redis_client.close()
   ```

**Verification:**

- [ ] Only one instance runs cleanup at a time
- [ ] Lock auto-expires after 60 seconds
- [ ] Lock released after cleanup completes
- [ ] Other instances skip when lock held
- [ ] No deadlocks or stuck locks

**Testing (Horizontal Scaling):**
```bash
# Start 3 backend instances
docker-compose up --scale backend=3

# Trigger cleanup job simultaneously on all instances
# Only one should execute, others should skip

# Check Redis for lock
redis-cli GET lock:cleanup_desktop_sessions
```

---

### Task 3.3: Optimize Redis Key Scanning

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

**Objective:**
Replace SCAN-based counting with efficient Redis data structures.

**Implementation Steps:**

1. **Add Counter Keys:**
   - Update presence service to maintain counts
   - File: `/src/backend/api/services/presence_service.py`
   ```python
   async def set_present(self, session_id: UUID, user_id: UUID) -> bool:
       """Mark session present and increment counters."""
       try:
           r = await self._get_redis()
           ttl = settings.presence.ttl_seconds
           sid = str(session_id)
           uid = str(user_id)

           pipe = r.pipeline(transaction=False)

           # Existing keys
           pipe.set(f"presence:desktop:{sid}", uid, ex=ttl)
           pipe.sadd(f"presence:user:{uid}", sid)
           pipe.expire(f"presence:user:{uid}", ttl)

           # NEW: Increment counters
           pipe.sadd("presence:all_sessions", sid)  # Set of all session IDs
           pipe.expire("presence:all_sessions", ttl)
           pipe.sadd("presence:all_users", uid)  # Set of all user IDs
           pipe.expire("presence:all_users", ttl)

           await pipe.execute()

           logger.debug(f"Presence SET for session {sid} user {uid}")
           return True

       except Exception as e:
           logger.warning(f"Presence Redis SET failed (non-fatal): {e}")
           return False

   async def remove_present(self, session_id: UUID, user_id: UUID) -> bool:
       """Remove session and decrement counters."""
       try:
           r = await self._get_redis()
           sid = str(session_id)
           uid = str(user_id)

           pipe = r.pipeline(transaction=False)

           # Existing deletions
           pipe.delete(f"presence:desktop:{sid}")
           pipe.srem(f"presence:user:{uid}", sid)

           # NEW: Remove from sets
           pipe.srem("presence:all_sessions", sid)
           pipe.srem("presence:all_users", uid)

           await pipe.execute()

           logger.debug(f"Presence DEL for session {sid} user {uid}")
           return True

       except Exception as e:
           logger.warning(f"Presence Redis DEL failed (non-fatal): {e}")
           return False

   async def count_present_sessions(self) -> int:
       """Count using set cardinality (O(1) instead of O(N))."""
       try:
           r = await self._get_redis()
           return await r.scard("presence:all_sessions")
       except Exception:
           return 0

   async def get_all_present_session_ids(self) -> set[str]:
       """Get all session IDs using set (O(N) but single command)."""
       try:
           r = await self._get_redis()
           return await r.smembers("presence:all_sessions")
       except Exception:
           return set()

   async def get_present_user_ids(self) -> set[str]:
       """Get all user IDs using set (O(N) but single command)."""
       try:
           r = await self._get_redis()
           return await r.smembers("presence:all_users")
       except Exception:
           return set()
   ```

**Performance Comparison:**

| Operation | Before (SCAN) | After (SET) |
|-----------|--------------|-------------|
| Count sessions | O(N) total keys | O(1) |
| Get all sessions | O(N) total keys | O(M) session keys |
| Count users | O(N) total keys | O(1) |

**Verification:**

- [ ] Count queries return instantly
- [ ] Counts accurate under load
- [ ] Sets maintained correctly on set/remove
- [ ] No stale entries in sets

**Testing:**
```python
# Before optimization
await presence_service.count_present_sessions()
# Execution time: ~50ms for 10k total keys

# After optimization
await presence_service.count_present_sessions()
# Execution time: ~1ms (50× faster)
```

---

### Task 3.4: Add Database Query Optimization

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Optimize slow queries with proper indexing and query structure.

**Implementation Steps:**

1. **Analyze Slow Queries:**
   ```sql
   -- Enable query logging (PostgreSQL)
   ALTER DATABASE supportcenter SET log_min_duration_statement = 100;  -- Log queries > 100ms

   -- Check slow queries
   SELECT query, calls, total_time, mean_time
   FROM pg_stat_statements
   WHERE query LIKE '%desktop_sessions%'
   ORDER BY mean_time DESC
   LIMIT 10;
   ```

2. **Add Composite Indexes:**
   - Create migration for commonly queried columns:
   ```bash
   python -m alembic revision -m "add_composite_indexes_desktop_sessions"
   ```

3. **Migration SQL:**
   ```sql
   -- Composite index for cleanup query
   CREATE INDEX CONCURRENTLY ix_desktop_sessions_active_heartbeat
   ON desktop_sessions(is_active, last_heartbeat)
   WHERE is_active = TRUE;

   -- Composite index for user session lookup
   CREATE INDEX CONCURRENTLY ix_desktop_sessions_user_created
   ON desktop_sessions(user_id, created_at DESC);

   -- Partial index for active sessions only
   CREATE INDEX CONCURRENTLY ix_desktop_sessions_active_only
   ON desktop_sessions(id, user_id, last_heartbeat)
   WHERE is_active = TRUE;
   ```

4. **Optimize Cleanup Query:**
   - File: `/src/backend/api/repositories/management/desktop_session_repository.py`
   - Ensure query uses new indexes:
   ```python
   async def find_stale(self, timeout_minutes: int = 20) -> list[DesktopSession]:
       """Find stale sessions using optimized query."""
       cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

       # Query uses ix_desktop_sessions_active_heartbeat index
       stmt = (
           select(DesktopSession)
           .where(
               DesktopSession.is_active == True,  # Index condition first
               DesktopSession.last_heartbeat < cutoff_time
           )
           .order_by(DesktopSession.last_heartbeat.asc())  # Optional: process oldest first
       )

       result = await self.session.execute(stmt)
       return result.scalars().all()
   ```

**Verification:**

- [ ] Cleanup query uses index (check EXPLAIN ANALYZE)
- [ ] Query time < 10ms for 1M sessions
- [ ] No sequential scans on large tables
- [ ] Indexes created CONCURRENTLY (no downtime)

**Query Analysis:**
```sql
EXPLAIN ANALYZE
SELECT * FROM desktop_sessions
WHERE is_active = TRUE
  AND last_heartbeat < NOW() - INTERVAL '20 minutes';

-- Should show: Index Scan using ix_desktop_sessions_active_heartbeat
```

---

### Task 3.5: Add Connection Pool Monitoring

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Monitor database connection pool health to prevent exhaustion.

**Implementation Steps:**

1. **Add Metrics Endpoint:**
   - File: `/src/backend/api/routers/internal/health_router.py`
   ```python
   @router.get("/metrics/database")
   async def get_database_metrics(
       db: AsyncSession = Depends(get_session)
   ):
       """Get database connection pool metrics."""
       from db.database import engine

       pool = engine.pool

       return {
           "poolSize": pool.size(),
           "checkedOut": pool.checkedout(),
           "overflow": pool.overflow(),
           "checkedIn": pool.checkedin(),
           "queueSize": pool.size() - pool.checkedout() - pool.checkedin(),
           "maxOverflow": engine.pool._max_overflow,
           "poolTimeout": engine.pool._timeout,
           "status": "healthy" if pool.checkedout() < pool.size() * 0.8 else "warning"
       }
   ```

2. **Add Prometheus Metrics:**
   - File: `/src/backend/core/metrics.py` (create new)
   ```python
   from prometheus_client import Gauge

   db_pool_size = Gauge('db_pool_size', 'Database connection pool size')
   db_pool_checked_out = Gauge('db_pool_checked_out', 'Checked out connections')
   db_pool_overflow = Gauge('db_pool_overflow', 'Overflow connections')

   async def update_pool_metrics():
       """Update Prometheus metrics from pool state."""
       from db.database import engine
       pool = engine.pool

       db_pool_size.set(pool.size())
       db_pool_checked_out.set(pool.checkedout())
       db_pool_overflow.set(pool.overflow())
   ```

3. **Add Periodic Metrics Update:**
   - File: `/src/backend/main.py`
   - Add lifespan task:
   ```python
   @asynccontextmanager
   async def lifespan(app: FastAPI):
       # Existing startup code...

       # Start metrics updater
       metrics_task = asyncio.create_task(periodic_metrics_update())

       yield

       # Shutdown
       metrics_task.cancel()

   async def periodic_metrics_update():
       """Update metrics every 10 seconds."""
       while True:
           await update_pool_metrics()
           await asyncio.sleep(10)
   ```

**Verification:**

- [ ] Metrics endpoint returns pool stats
- [ ] Prometheus metrics exported
- [ ] Pool usage monitored in Grafana
- [ ] Alerts configured for pool exhaustion

---

### Task 3.6: Add Horizontal Scaling Documentation

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** Tasks 3.1-3.5

**Objective:**
Document how to scale backend horizontally with multiple instances.

**Implementation Steps:**

1. **Create Scaling Guide:**
   - File: `/docs/horizontal-scaling-guide.md` (create new)
   ```markdown
   # Horizontal Scaling Guide

   ## Overview
   This guide explains how to scale the backend horizontally to handle increased load.

   ## Prerequisites
   - ✅ Redis persistence enabled (Task 3.1)
   - ✅ Distributed locks for cleanup jobs (Task 3.2)
   - ✅ Optimized Redis queries (Task 3.3)
   - ✅ Database indexes optimized (Task 3.4)

   ## Scaling Configuration

   ### Docker Compose
   ```yaml
   services:
     backend:
       image: backend:latest
       deploy:
         replicas: 3  # Scale to 3 instances
       environment:
         - DATABASE_POOL_SIZE=10      # 10 per instance = 30 total
         - REDIS_MAX_CONNECTIONS=30   # 30 per instance = 90 total
   ```

   ### Database Pool Sizing
   **Formula:** `pool_size × num_instances ≤ postgres_max_connections`

   **Example:**
   - 3 backend instances
   - 10 connections per instance
   - Total: 30 connections
   - Postgres max_connections: 100 (safe margin)

   ### Redis Connection Sizing
   **Formula:** `max_connections × num_instances ≤ redis_maxclients`

   **Example:**
   - 3 backend instances
   - 30 connections per instance
   - Total: 90 connections
   - Redis maxclients: 10000 (default, plenty of headroom)

   ## Load Balancing

   Use Nginx or ALB for load balancing:
   ```nginx
   upstream backend {
       least_conn;  # Route to instance with fewest connections
       server backend-1:8000;
       server backend-2:8000;
       server backend-3:8000;
   }
   ```

   ## Monitoring
   - Database pool metrics: `/internal/metrics/database`
   - Redis connection count: `redis-cli INFO clients`
   - Cleanup job coordination: Check Redis lock keys
   ```

2. **Add Deployment Checklist:**
   ```markdown
   ## Deployment Checklist

   ### Before Scaling
   - [ ] Verify Redis persistence enabled
   - [ ] Verify distributed locks working
   - [ ] Run load test on single instance
   - [ ] Baseline metrics recorded

   ### During Scaling
   - [ ] Gradually increase replicas (1 → 2 → 3)
   - [ ] Monitor database pool usage
   - [ ] Monitor Redis connection count
   - [ ] Verify cleanup job runs only once

   ### After Scaling
   - [ ] Verify session tracking accurate
   - [ ] Verify heartbeats processed correctly
   - [ ] Monitor for lock contention
   - [ ] Load test at target scale
   ```

**Verification:**

- [ ] Documentation complete and accurate
- [ ] Examples tested and verified
- [ ] Scaling checklist validated
- [ ] Team trained on scaling procedures

---

## Phase 4: Reliability & Resilience

**Goal:** Improve error handling, recovery, and fault tolerance
**Timeline:** Week 4-5
**Priority:** P2 (Medium)
**Progress:** 0% (0/6 tasks completed)

### Task 4.1: Add Redis Fallback Logic

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

**Objective:**
Gracefully degrade to database-only mode when Redis is unavailable.

**Implementation Steps:**

1. **Add Fallback Detection:**
   - File: `/src/backend/api/services/presence_service.py`
   ```python
   class PresenceRedisService:
       def __init__(self):
           self._redis: Any = None
           self._is_available: bool = True
           self._last_health_check: datetime = datetime.min

       async def _check_health(self) -> bool:
           """Check Redis health (cached for 10 seconds)."""
           now = datetime.utcnow()
           if (now - self._last_health_check).total_seconds() < 10:
               return self._is_available

           try:
               r = await self._get_redis()
               await r.ping()
               self._is_available = True
           except Exception as e:
               logger.error(f"Redis health check failed: {e}")
               self._is_available = False

           self._last_health_check = now
           return self._is_available

       async def set_present(self, session_id: UUID, user_id: UUID) -> bool:
           """Set presence with fallback."""
           if not await self._check_health():
               logger.warning(f"Redis unavailable, skipping presence set for {session_id}")
               return False

           # Existing implementation...
   ```

2. **Add Database Fallback Queries:**
   - File: `/src/backend/api/repositories/management/desktop_session_repository.py`
   ```python
   async def count_active_sessions(self) -> int:
       """Count active sessions (DB fallback when Redis unavailable)."""
       result = await self.session.execute(
           select(func.count()).select_from(DesktopSession).where(
               DesktopSession.is_active == True
           )
       )
       return result.scalar()

   async def get_active_session_ids(self) -> set[str]:
       """Get active session IDs (DB fallback)."""
       result = await self.session.execute(
           select(DesktopSession.id).where(DesktopSession.is_active == True)
       )
       return {str(row[0]) for row in result.all()}
   ```

3. **Update Endpoints to Use Fallback:**
   - File: `/src/backend/api/routers/management/desktop_sessions_router.py`
   ```python
   @router.get("/stats")
   async def get_desktop_session_stats(db: AsyncSession = Depends(get_session)):
       """Stats with Redis fallback to database."""
       from api.services.presence_service import presence_service

       # Try Redis first
       redis_available = await presence_service._check_health()

       if redis_available:
           redis_count = await presence_service.count_present_sessions()
           redis_user_ids = await presence_service.get_present_user_ids()

           return {
               "totalSessions": redis_count,
               "uniqueUsers": len(redis_user_ids),
               "source": "redis"
           }
       else:
           # Fallback to database
           from api.repositories.management.desktop_session_repository import DesktopSessionRepository
           repo = DesktopSessionRepository(db)

           db_count = await repo.count_active_sessions()
           db_sessions = await repo.get_active_session_ids()

           # Extract unique user IDs (slower but works)
           stmt = select(DesktopSession.user_id).where(DesktopSession.is_active == True).distinct()
           result = await db.execute(stmt)
           unique_users = len(result.all())

           return {
               "totalSessions": db_count,
               "uniqueUsers": unique_users,
               "source": "database",
               "warning": "Redis unavailable, using database fallback"
           }
   ```

**Verification:**

- [ ] System functions when Redis is down
- [ ] Stats endpoint returns DB data as fallback
- [ ] Heartbeats still work (DB writes succeed)
- [ ] Warning logged when using fallback
- [ ] System auto-recovers when Redis restored

**Testing:**
```bash
# Stop Redis
docker-compose stop redis

# Verify heartbeats still work
curl -X POST https://api.example.com/sessions/desktop/{id}/heartbeat

# Verify stats endpoint returns DB data
curl https://api.example.com/sessions/desktop/stats
# Should return: {"source": "database", "warning": "..."}

# Restart Redis
docker-compose start redis

# Verify auto-recovery
curl https://api.example.com/sessions/desktop/stats
# Should return: {"source": "redis"}
```

---

### Task 4.2: Add Circuit Breaker for Redis

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** Task 4.1

**Objective:**
Implement circuit breaker pattern to prevent Redis from being overwhelmed during recovery.

**Implementation Steps:**

1. **Add Circuit Breaker Library:**
   - File: `/src/backend/pyproject.toml`
   ```toml
   dependencies = [
       # ... existing ...
       "pybreaker>=1.0.1",
   ]
   ```

2. **Implement Circuit Breaker:**
   - File: `/src/backend/api/services/presence_service.py`
   ```python
   from pybreaker import CircuitBreaker, CircuitBreakerError

   # Circuit breaker: Open after 5 failures, retry after 60 seconds
   redis_breaker = CircuitBreaker(
       fail_max=5,
       timeout_duration=60,
       name="redis_presence"
   )

   class PresenceRedisService:
       async def set_present(self, session_id: UUID, user_id: UUID) -> bool:
           """Set presence with circuit breaker."""
           try:
               # Wrap Redis call in circuit breaker
               return await redis_breaker.call_async(
                   self._set_present_impl,
                   session_id,
                   user_id
               )
           except CircuitBreakerError:
               logger.warning(
                   f"Redis circuit breaker OPEN, skipping presence set for {session_id}"
               )
               return False
           except Exception as e:
               logger.warning(f"Presence Redis SET failed: {e}")
               return False

       async def _set_present_impl(self, session_id: UUID, user_id: UUID) -> bool:
           """Implementation wrapped by circuit breaker."""
           r = await self._get_redis()
           ttl = settings.presence.ttl_seconds
           sid = str(session_id)
           uid = str(user_id)

           pipe = r.pipeline(transaction=False)
           pipe.set(f"presence:desktop:{sid}", uid, ex=ttl)
           pipe.sadd(f"presence:user:{uid}", sid)
           pipe.expire(f"presence:user:{uid}", ttl)
           await pipe.execute()

           return True
   ```

3. **Add Monitoring:**
   ```python
   @router.get("/health/redis")
   async def get_redis_health():
       """Get Redis circuit breaker status."""
       return {
           "state": redis_breaker.current_state,  # "closed", "open", "half_open"
           "failCounter": redis_breaker.fail_counter,
           "failMax": redis_breaker.fail_max,
           "timeoutDuration": redis_breaker.timeout_duration,
           "healthy": redis_breaker.current_state == "closed"
       }
   ```

**Circuit Breaker States:**

| State | Meaning | Behavior |
|-------|---------|----------|
| **Closed** | Healthy | All requests pass through |
| **Open** | Unhealthy | All requests fail fast (no Redis calls) |
| **Half-Open** | Testing recovery | Limited requests allowed to test |

**Verification:**

- [ ] Circuit opens after 5 consecutive failures
- [ ] Circuit stays open for 60 seconds
- [ ] Circuit half-opens to test recovery
- [ ] Circuit closes when Redis recovers
- [ ] No Redis calls when circuit open

---

### Task 4.3: Add Retry Logic for Transient Failures

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Retry database operations on transient failures (deadlock, timeout).

**Implementation Steps:**

1. **Add Retry Decorator:**
   - File: `/src/backend/core/decorators.py`
   ```python
   import asyncio
   from functools import wraps
   from sqlalchemy.exc import OperationalError, DBAPIError

   def retry_on_db_error(max_retries: int = 3, backoff_seconds: float = 1.0):
       """Retry decorator for transient database errors."""
       def decorator(func):
           @wraps(func)
           async def wrapper(*args, **kwargs):
               last_exception = None

               for attempt in range(max_retries):
                   try:
                       return await func(*args, **kwargs)
                   except (OperationalError, DBAPIError) as e:
                       last_exception = e

                       # Check if transient (retry-able)
                       is_transient = any(
                           msg in str(e).lower()
                           for msg in ["deadlock", "timeout", "connection", "lock"]
                       )

                       if not is_transient or attempt == max_retries - 1:
                           raise

                       # Exponential backoff
                       wait_time = backoff_seconds * (2 ** attempt)
                       logger.warning(
                           f"Transient DB error on attempt {attempt + 1}/{max_retries}: {e}. "
                           f"Retrying in {wait_time}s..."
                       )
                       await asyncio.sleep(wait_time)

               raise last_exception

           return wrapper
       return decorator
   ```

2. **Apply to Critical Operations:**
   - File: `/src/backend/api/services/management/desktop_session_service.py`
   ```python
   from core.decorators import retry_on_db_error

   @staticmethod
   @retry_on_db_error(max_retries=3, backoff_seconds=0.5)
   @transactional_database_operation("update_desktop_heartbeat")
   async def update_heartbeat(db, session_id, ip_address=None):
       # Existing implementation...
   ```

**Verification:**

- [ ] Transient failures retried automatically
- [ ] Exponential backoff works correctly
- [ ] Non-transient failures not retried
- [ ] Max retries respected
- [ ] Logs show retry attempts

**Testing (Simulate Deadlock):**
```python
# In test environment, force deadlock
async def test_retry_on_deadlock():
    # Simulate deadlock by locking same row from 2 transactions
    # Should retry and eventually succeed
```

---

### Task 4.4: Add Graceful Degradation Documentation

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** Tasks 4.1-4.3

**Objective:**
Document failure modes and degradation behavior.

**Implementation Steps:**

1. **Create Failure Modes Document:**
   - File: `/docs/failure-modes-and-recovery.md` (create new)
   ```markdown
   # Failure Modes and Recovery

   ## Overview
   This document describes how the desktop session tracking system handles failures.

   ## Failure Scenarios

   ### Redis Unavailable
   **Detection:** Health check fails (ping timeout)
   **Impact:** Presence data unavailable
   **Degradation:**
   - Heartbeats still succeed (database writes)
   - Stats endpoint falls back to database queries
   - Dashboard may show stale data (up to 20 min delay)

   **Recovery:**
   - Automatic when Redis comes back online
   - Circuit breaker half-opens after 60s
   - Presence data rebuilds from next heartbeats

   **Monitoring:**
   - Alert: `redis_circuit_breaker_state == "open"`
   - Metric: `redis_health_check_failures_total`

   ### Database Timeout
   **Detection:** Query exceeds timeout (30s)
   **Impact:** Heartbeat or cleanup fails
   **Degradation:**
   - Automatic retry (3 attempts with backoff)
   - Client retries heartbeat on next interval

   **Recovery:**
   - Transient: Retry succeeds after backoff
   - Persistent: DBA investigates slow queries

   **Monitoring:**
   - Alert: `db_query_duration_seconds > 5`
   - Metric: `db_retry_attempts_total`

   ### Backend Instance Crash
   **Detection:** Load balancer health check fails
   **Impact:** Some heartbeats lost
   **Degradation:**
   - Load balancer routes to healthy instances
   - Lost heartbeats recovered on next interval (5 min)
   - Cleanup job continues on other instances (distributed lock)

   **Recovery:**
   - Immediate (load balancer removes crashed instance)
   - No data loss (stateless backend)

   **Monitoring:**
   - Alert: `backend_instances_healthy < 2`

   ### Network Partition
   **Detection:** Client cannot reach backend
   **Impact:** Heartbeats cannot be sent
   **Degradation:**
   - Client logs error, continues trying
   - Redis keys expire after 11 minutes
   - Session marked inactive after 20 minutes

   **Recovery:**
   - Automatic when network restored
   - Next heartbeat succeeds, session reactivated

   **User Impact:** Appears offline during partition

   ## Service Level Objectives (SLOs)

   | Metric | Target | Measurement |
   |--------|--------|-------------|
   | Heartbeat Success Rate | 99.9% | `heartbeat_success_total / heartbeat_attempts_total` |
   | Presence Data Accuracy | 99% | `redis_presence_matches_db_active / total_sessions` |
   | Recovery Time (Redis) | < 5 min | Time from Redis restart to full presence data |
   | Recovery Time (Backend) | < 1 min | Time from instance crash to load balancer recovery |
   ```

**Verification:**

- [ ] All failure modes documented
- [ ] Recovery procedures tested
- [ ] SLOs defined and measurable
- [ ] Team trained on incident response

---

### Task 4.5: Add Health Check Endpoints

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** None

**Objective:**
Implement comprehensive health checks for monitoring and load balancing.

**Implementation Steps:**

1. **Add Health Check Router:**
   - File: `/src/backend/api/routers/internal/health_router.py`
   ```python
   from fastapi import APIRouter, Depends
   from sqlalchemy.ext.asyncio import AsyncSession
   from db.database import get_session

   router = APIRouter()

   @router.get("/health/liveness")
   async def liveness():
       """
       Kubernetes liveness probe.
       Returns 200 if application is running.
       """
       return {"status": "alive"}

   @router.get("/health/readiness")
   async def readiness(db: AsyncSession = Depends(get_session)):
       """
       Kubernetes readiness probe.
       Returns 200 if application can serve traffic.
       """
       from api.services.presence_service import presence_service

       health_checks = {}
       overall_healthy = True

       # Check database
       try:
           await db.execute(text("SELECT 1"))
           health_checks["database"] = "healthy"
       except Exception as e:
           health_checks["database"] = f"unhealthy: {e}"
           overall_healthy = False

       # Check Redis (non-blocking)
       try:
           redis_healthy = await presence_service._check_health()
           health_checks["redis"] = "healthy" if redis_healthy else "degraded"
       except Exception as e:
           health_checks["redis"] = f"unhealthy: {e}"
           # Don't mark overall as unhealthy (Redis is optional)

       return {
           "status": "ready" if overall_healthy else "not_ready",
           "checks": health_checks
       }

   @router.get("/health/detailed")
   async def detailed_health(db: AsyncSession = Depends(get_session)):
       """
       Detailed health check for monitoring.
       Includes component status and metrics.
       """
       from api.services.presence_service import presence_service
       from db.database import engine

       # Database pool health
       pool = engine.pool
       db_health = {
           "status": "healthy" if pool.checkedout() < pool.size() * 0.8 else "degraded",
           "poolSize": pool.size(),
           "checkedOut": pool.checkedout(),
           "utilization": pool.checkedout() / pool.size() if pool.size() > 0 else 0
       }

       # Redis health
       redis_healthy = await presence_service._check_health()
       redis_health = {
           "status": "healthy" if redis_healthy else "unhealthy",
           "circuitBreaker": redis_breaker.current_state
       }

       return {
           "status": "healthy",
           "timestamp": datetime.utcnow().isoformat(),
           "components": {
               "database": db_health,
               "redis": redis_health
           }
       }
   ```

2. **Configure Load Balancer:**
   - File: `/docker/nginx/nginx.conf`
   ```nginx
   upstream backend {
       server backend-1:8000 max_fails=3 fail_timeout=30s;
       server backend-2:8000 max_fails=3 fail_timeout=30s;
       server backend-3:8000 max_fails=3 fail_timeout=30s;
   }

   server {
       location /health/liveness {
           proxy_pass http://backend;
           proxy_connect_timeout 1s;
           proxy_read_timeout 1s;
       }

       # Health check (every 10s)
       location = /health_check {
           internal;
           proxy_pass http://backend/health/readiness;
       }
   }
   ```

**Verification:**

- [ ] Liveness probe returns 200 when app running
- [ ] Readiness probe returns 200 when DB connected
- [ ] Readiness probe returns 503 when DB down
- [ ] Load balancer removes unhealthy instances
- [ ] Detailed health shows component status

---

### Task 4.6: Add Incident Runbooks

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** Tasks 4.1-4.5

**Objective:**
Create runbooks for common incidents and recovery procedures.

**Implementation Steps:**

1. **Create Runbook Directory:**
   - File: `/docs/runbooks/desktop-sessions-redis-down.md`
   ```markdown
   # Runbook: Redis Down - Desktop Session Presence

   ## Symptoms
   - Alert: `redis_circuit_breaker_state == "open"`
   - Dashboard shows "Using database fallback" warning
   - Heartbeat success rate remains high (>99%)
   - Stats endpoint returns `"source": "database"`

   ## Impact
   - **Severity:** Medium
   - **User Impact:** Minimal (heartbeats still work)
   - **Data Impact:** Presence data stale (up to 20 min delay)

   ## Diagnosis

   1. Check Redis health:
      ```bash
      curl https://api.example.com/health/detailed
      # Look for redis.status: "unhealthy"
      ```

   2. Check Redis container:
      ```bash
      docker ps | grep redis
      docker logs redis --tail 50
      ```

   3. Test Redis connection:
      ```bash
      redis-cli -h localhost -p 6380 ping
      # Should return: PONG
      ```

   ## Resolution

   ### If Redis is crashed:
   ```bash
   # Restart Redis container
   docker-compose restart redis

   # Verify health
   curl https://api.example.com/health/detailed
   # redis.status should be "healthy"

   # Monitor recovery
   watch -n 5 'curl -s https://api.example.com/health/detailed | jq .components.redis'
   ```

   ### If Redis is slow/overloaded:
   ```bash
   # Check Redis memory usage
   redis-cli INFO memory

   # Check slow queries
   redis-cli SLOWLOG GET 10

   # If memory full, clear old keys
   redis-cli FLUSHDB  # CAUTION: Clears all presence data
   ```

   ## Prevention
   - Enable Redis persistence (Task 3.1)
   - Monitor Redis memory usage
   - Set maxmemory policy: `volatile-lru`
   - Alert on high memory (>80%)

   ## Post-Incident
   - Verify presence data accuracy after recovery
   - Check for data loss (compare DB active sessions vs Redis keys)
   - Update incident log with root cause
   ```

2. **Create Additional Runbooks:**
   - `/docs/runbooks/desktop-sessions-cleanup-not-running.md`
   - `/docs/runbooks/desktop-sessions-pool-exhaustion.md`
   - `/docs/runbooks/desktop-sessions-stale-data.md`

**Verification:**

- [ ] Runbooks tested in staging environment
- [ ] Team trained on runbook procedures
- [ ] Runbooks linked from monitoring alerts
- [ ] Runbooks updated after incidents

---

## Phase 5: Monitoring & Observability

**Goal:** Add comprehensive monitoring, logging, and alerting
**Timeline:** Week 5-6
**Priority:** P3 (Nice to Have)
**Progress:** 0% (0/8 tasks completed)

### Task 5.1: Add Structured Logging

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

### Task 5.2: Add Prometheus Metrics

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** None

### Task 5.3: Add Grafana Dashboards

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** Task 5.2

### Task 5.4: Add Alert Rules

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** Task 5.2

### Task 5.5: Add Distributed Tracing

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** None

### Task 5.6: Add Session Analytics

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 3 hours
**Dependencies:** None

### Task 5.7: Add User Activity Heatmap

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 4 hours
**Dependencies:** Task 5.6

### Task 5.8: Add Observability Documentation

**Status:** 🔴 Not Started
**Assignee:** _Unassigned_
**Estimated Effort:** 2 hours
**Dependencies:** Tasks 5.1-5.7

---

## Testing Strategy

### Unit Tests
- Repository methods (heartbeat update, cleanup query, version check)
- Service methods (session creation, fingerprint validation, lock acquisition)
- Configuration validation (TTL >= 2× heartbeat)

### Integration Tests
- Heartbeat flow (client → router → service → repository → Redis)
- Cleanup job with distributed lock
- Redis fallback to database
- Circuit breaker state transitions

### Load Tests
- 1000 concurrent heartbeats (verify no race conditions)
- 10,000 active sessions (verify query performance)
- Redis failure during high load (verify graceful degradation)

### End-to-End Tests
- Tauri app sends heartbeat → appears online in dashboard
- Network partition → appears offline after 11 minutes
- App crash → cleanup marks inactive after 20 minutes

---

## Rollback Plan

### Phase 1 Rollback
```sql
-- Revert cleanup timeout
UPDATE scheduled_jobs
SET task_args = '{"timeout_minutes": 1440}'::jsonb
WHERE name = 'Desktop Session Cleanup (Every Minute)';

-- Disable hard delete job
UPDATE scheduled_jobs
SET is_active = FALSE
WHERE name = 'Desktop Session Hard Delete (Daily)';

-- Revert migrations
python -m alembic downgrade -1
```

### Phase 2 Rollback
- Disable rate limiting (remove decorator)
- Disable fingerprint validation (comment out check)
- Disable geolocation (skip check)

### Phase 3 Rollback
- Disable Redis persistence (remove config)
- Disable distributed locks (remove from task)
- Revert to SCAN-based counting

### Phase 4 Rollback
- Disable circuit breaker (remove wrapper)
- Disable retry logic (remove decorator)
- Disable fallback (force Redis only)

---

## Success Metrics

### Data Accuracy
- **Metric:** Presence data accuracy
- **Target:** >99%
- **Measurement:** `(Redis present sessions matching DB active sessions) / (Total DB active sessions)`

### Performance
- **Metric:** Heartbeat latency (p95)
- **Target:** <100ms
- **Measurement:** Time from client request to server response

### Reliability
- **Metric:** Heartbeat success rate
- **Target:** >99.9%
- **Measurement:** `Successful heartbeats / Total heartbeat attempts`

### Scalability
- **Metric:** Sessions per backend instance
- **Target:** >10,000
- **Measurement:** Active sessions / Number of backend instances

### Resource Efficiency
- **Metric:** Database table size
- **Target:** <1GB for 100K users
- **Measurement:** `pg_total_relation_size('desktop_sessions')`

---

## Change Log

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-02-14 | 1.0 | _System_ | Initial plan created from technical analysis |

---

## Next Steps

1. **Review Plan:** Technical lead reviews and approves
2. **Assign Tasks:** Assign Phase 1 tasks to developers
3. **Setup Tracking:** Create project board or tickets
4. **Kick-off Meeting:** Brief team on plan and expectations
5. **Start Phase 1:** Begin implementation

---

**END OF PLAN**

**Remember:** Update progress after completing each task!
