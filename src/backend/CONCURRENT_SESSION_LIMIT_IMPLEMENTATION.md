# Concurrent Session Limit Enforcement Implementation

**Security Finding #47 - Resolution Report**

## Issue Summary

The `session_max_concurrent` configuration setting (default: 5) existed in `core/config.py` under `SecuritySettings` but was **not enforced** anywhere in the codebase. This allowed users to create unlimited concurrent sessions, potentially enabling:

1. Session hijacking across multiple devices
2. Credential sharing violations
3. Audit trail complications
4. Resource exhaustion attacks

## Root Cause Analysis

### Configuration Exists
```python
# core/config.py - SecuritySettings
session_max_concurrent: int = Field(
    default=5,
    description="Maximum concurrent sessions per user (0=unlimited)"
)
```

### Sessions Created in Two Services

1. **WebSessionService.create_session()** (`services/web_session_service.py`)
   - Used for: Passwordless login, AD login (web), Admin login
   - Creates sessions for Next.js it-app (IT agents/supervisors)

2. **DesktopSessionService.create_session()** (`services/desktop_session_service.py`)
   - Used for: SSO login, AD login (desktop)
   - Creates sessions for Tauri requester app (employees)

### Previous Behavior

Both services checked for existing sessions with the **same device fingerprint** and reused them, but neither service:
- Counted total active sessions per user
- Enforced the `session_max_concurrent` limit
- Cleaned up old sessions when limit was reached

## Implementation Details

### Enforcement Strategy: Automatic Session Eviction

**Design Decision**: When the limit is reached, automatically deactivate the **oldest session(s)** based on `last_heartbeat` timestamp instead of rejecting the new login.

**Rationale**:
1. **Better UX**: Users can always log in without manual session cleanup
2. **Security**: Old inactive sessions are most likely to be abandoned/compromised
3. **Self-healing**: Stale sessions are automatically cleaned up
4. **Auditability**: Session deactivation is logged for security monitoring

### Code Changes

#### 1. WebSessionService (`services/web_session_service.py`)

**Location**: Lines 98-130 (after device fingerprint check, before session creation)

```python
# Enforce concurrent session limit (if enabled)
max_concurrent = settings.security.session_max_concurrent
if max_concurrent > 0:
    # Count current active web sessions for this user
    count_stmt = (
        select(WebSession)
        .where(WebSession.user_id == user_id)
        .where(WebSession.is_active == True)
    )
    result = await db.execute(count_stmt)
    active_sessions = result.scalars().all()
    active_count = len(active_sessions)

    if active_count >= max_concurrent:
        logger.warning(
            f"Web session limit reached for user {user_id}: "
            f"{active_count}/{max_concurrent} active sessions"
        )

        # Delete oldest session(s) to make room
        # Sort by last_heartbeat (oldest first)
        active_sessions.sort(key=lambda s: s.last_heartbeat)
        sessions_to_remove = active_count - max_concurrent + 1

        for i in range(sessions_to_remove):
            old_session = active_sessions[i]
            old_session.is_active = False
            logger.info(
                f"Deactivated oldest web session {old_session.id} for user {user_id} "
                f"(last active: {old_session.last_heartbeat})"
            )

        await db.commit()
```

#### 2. DesktopSessionService (`services/desktop_session_service.py`)

**Location**: Lines 184-216 (after computer_name deactivation, before session creation)

```python
# Enforce concurrent session limit (if enabled)
max_concurrent = settings.security.session_max_concurrent
if max_concurrent > 0:
    # Count current active desktop sessions for this user
    count_stmt = (
        select(DesktopSession)
        .where(DesktopSession.user_id == user_id)
        .where(DesktopSession.is_active == True)
    )
    result = await db.execute(count_stmt)
    active_sessions = result.scalars().all()
    active_count = len(active_sessions)

    if active_count >= max_concurrent:
        logger.warning(
            f"Desktop session limit reached for user {user_id}: "
            f"{active_count}/{max_concurrent} active sessions"
        )

        # Delete oldest session(s) to make room
        # Sort by last_heartbeat (oldest first)
        active_sessions.sort(key=lambda s: s.last_heartbeat)
        sessions_to_remove = active_count - max_concurrent + 1

        for i in range(sessions_to_remove):
            old_session = active_sessions[i]
            old_session.is_active = False
            logger.info(
                f"Deactivated oldest desktop session {old_session.id} for user {user_id} "
                f"(last active: {old_session.last_heartbeat})"
            )

        await db.commit()
```

## Behavior Details

### When Enforcement Triggers

1. **Check happens**: BEFORE creating a new session
2. **Condition**: `active_count >= max_concurrent`
3. **Action**: Deactivate oldest sessions to make room for new session

### Calculation Example

If `session_max_concurrent = 5` and user has 5 active sessions:
- New login attempt: `active_count = 5, max_concurrent = 5`
- Condition met: `5 >= 5` → **TRUE**
- Sessions to remove: `5 - 5 + 1 = 1` session
- Result: Oldest session deactivated, new session created

If user has 6 active sessions (should never happen, but handles edge cases):
- Sessions to remove: `6 - 5 + 1 = 2` sessions
- Result: 2 oldest sessions deactivated

### Session Separation

**Important**: Web sessions and desktop sessions are counted **separately**.

- A user can have up to 5 **web** sessions (browsers/devices)
- A user can have up to 5 **desktop** sessions (Tauri app instances)
- Total: Up to 10 concurrent sessions (5 web + 5 desktop)

**Rationale**: Separate session types serve different purposes:
- Web: IT agents managing tickets from multiple locations
- Desktop: Employees submitting requests from different computers

If combined enforcement is needed in the future, modify both services to count `WebSession + DesktopSession` together.

## Configuration

### Enable/Disable Enforcement

**Default (enabled with limit of 5)**:
```env
# .env
SESSION_MAX_CONCURRENT=5
```

**Unlimited sessions (disable enforcement)**:
```env
# .env
SESSION_MAX_CONCURRENT=0
```

**Custom limit**:
```env
# .env
SESSION_MAX_CONCURRENT=3  # Only 3 concurrent sessions per user
```

### Security Recommendations

1. **Production**: Set to `5` (default) for balanced security and usability
2. **High-security environments**: Set to `2-3` to minimize credential sharing
3. **Development**: Set to `0` (unlimited) for testing convenience
4. **Enterprise**: Set to `1` for strict single-session enforcement

## Logging and Monitoring

### Log Messages

**When limit is reached**:
```
WARNING: Web session limit reached for user <uuid>: 5/5 active sessions
INFO: Deactivated oldest web session <uuid> for user <uuid> (last active: 2025-01-07 10:30:00)
```

**When new session is created**:
```
INFO: Created new web session <uuid> for user <uuid> | Auth: passwordless | IP: 192.168.1.100
```

### Metrics to Monitor

1. **Frequency of limit enforcement**: High frequency may indicate:
   - Credential sharing
   - Users not properly logging out
   - Session cleanup service failures

2. **Users hitting limit repeatedly**: Investigate for:
   - Legitimate multi-device usage (increase limit if needed)
   - Account compromise (audit sessions)
   - Session hijacking attempts

3. **Large gaps between oldest and newest session**: May indicate abandoned sessions

## Security Implications

### Protections Added

1. **Prevents unlimited session growth**: Mitigates resource exhaustion
2. **Auto-cleanup of stale sessions**: Reduces attack surface
3. **Audit trail**: All deactivations are logged with timestamps
4. **Configurable enforcement**: Adaptable to different security policies

### Potential Issues

1. **Legitimate multi-device users**: May experience unexpected logouts from old devices
   - **Mitigation**: Increase limit or educate users to log out properly

2. **Race conditions**: Concurrent logins might briefly exceed limit
   - **Impact**: Minimal, next login will clean up excess sessions

3. **Session hijacking detection**: Automatic cleanup may hide ongoing attacks
   - **Mitigation**: Monitor logs for unusual session creation patterns

## Testing Recommendations

### Manual Testing

1. **Test basic enforcement**:
   - Log in 5 times with different device fingerprints
   - On 6th login, verify oldest session is deactivated
   - Check logs for proper messages

2. **Test with limit = 0**:
   - Set `SESSION_MAX_CONCURRENT=0`
   - Log in 10+ times
   - Verify no sessions are deactivated

3. **Test edge cases**:
   - Same device fingerprint (should reuse session, not create new)
   - Concurrent logins from different devices
   - Mixed web and desktop sessions

### Automated Testing

Create test in `tests/unit/test_session_services.py`:

```python
async def test_web_session_concurrent_limit(db_session):
    """Test that web sessions enforce concurrent limit"""
    user = await create_test_user(db_session)

    # Create 5 sessions (at limit)
    sessions = []
    for i in range(5):
        session = await WebSessionService.create_session(
            db=db_session,
            user_id=user.id,
            ip_address=f"192.168.1.{i}",
            device_fingerprint=f"fingerprint-{i}"
        )
        sessions.append(session)

    # All sessions should be active
    active_count = await count_active_web_sessions(db_session, user.id)
    assert active_count == 5

    # Create 6th session (should evict oldest)
    new_session = await WebSessionService.create_session(
        db=db_session,
        user_id=user.id,
        ip_address="192.168.1.10",
        device_fingerprint="fingerprint-new"
    )

    # Should still have 5 active sessions
    active_count = await count_active_web_sessions(db_session, user.id)
    assert active_count == 5

    # Oldest session should be deactivated
    await db_session.refresh(sessions[0])
    assert sessions[0].is_active == False
```

## Deployment Checklist

- [x] Code implemented in both session services
- [x] Syntax validation passed
- [x] Documentation created
- [ ] Manual testing performed
- [ ] Automated tests added (recommended)
- [ ] Security team review (if required)
- [ ] Production deployment planned
- [ ] Monitoring alerts configured
- [ ] User communication (if limit is restrictive)

## Related Files Modified

1. `/home/arc-webapp-01/support_center/src/backend/services/web_session_service.py`
   - Lines 59-60: Added `Raises` documentation
   - Lines 62-63: Import settings and HTTPException
   - Lines 98-130: Session limit enforcement logic

2. `/home/arc-webapp-01/support_center/src/backend/services/desktop_session_service.py`
   - Lines 117-118: Added `Raises` documentation
   - Lines 120-121: Import settings and HTTPException
   - Lines 184-216: Session limit enforcement logic

## References

- **Security Finding**: #47 - Concurrent session limit not enforced
- **Configuration**: `core/config.py` - `SecuritySettings.session_max_concurrent`
- **Session Models**: `models/database_models.py` - `WebSession`, `DesktopSession`
- **Auth Service**: `services/auth_service.py` - Calls session services during login

## Resolution Status

✅ **RESOLVED** - Concurrent session limit enforcement is now active for both web and desktop sessions.

**Date Implemented**: 2025-01-07
**Implemented By**: Claude Code (Sonnet 4.5)
**Review Status**: Pending manual testing and security review
