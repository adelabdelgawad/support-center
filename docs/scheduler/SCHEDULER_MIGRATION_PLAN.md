# Scheduler Migration Plan

This document details the migration from the current in-process APScheduler to the database-backed scheduler system.

---

## Current State Analysis

### Files to Replace

| Current File | Issue | Replacement |
|--------------|-------|-------------|
| `core/scheduler.py` | Jobs run in-process, not Celery | `core/scheduler_manager.py` |

### Current Jobs Running In-Process

| Job | Schedule | Risk Level |
|-----|----------|------------|
| `sync_domain_users_job` | 1 hour | Medium - Database operations |
| `cleanup_expired_tokens_job` | 24 hours | Low - Daily cleanup |
| `cleanup_stale_desktop_sessions_job` | 1 minute | **High** - Frequent, can block |

### Problems Being Solved

1. **Multi-worker race condition**: 4 workers = 4 schedulers running same jobs
2. **Connection pool exhaustion**: Jobs compete with API requests
3. **Event loop blocking**: 1-minute job can block request handling
4. **No management UI**: Jobs require code changes

---

## Migration Strategy

### Principle: Zero Downtime

The migration uses a **parallel operation period** where both old and new systems run simultaneously before cutting over.

### Timeline

| Day | Phase | Actions |
|-----|-------|---------|
| 1-2 | Database Setup | Create tables, run migration, seed data |
| 3-4 | Backend Services | Implement service, API, Celery integration |
| 5-6 | Testing | Test new system with old system still running |
| 7-8 | Frontend | Build UI for management |
| 9 | Cutover | Disable old scheduler, enable new |
| 10 | Cleanup | Remove old scheduler.py |

---

## Phase 1: Database Setup (No Impact)

### Actions

1. Create migration file
2. Run migration to create new tables
3. Seed job types and task functions
4. **Old scheduler continues running**

### Verification

```bash
# Verify tables exist
psql -c "\dt *scheduler*"
psql -c "\dt task_functions"

# Verify seed data
psql -c "SELECT * FROM scheduler_job_types;"
psql -c "SELECT * FROM task_functions;"
```

### Rollback

```bash
uv run alembic downgrade -1
```

---

## Phase 2: Backend Implementation (No Impact)

### Actions

1. Create schemas in `schemas/scheduler/`
2. Create service in `services/scheduler_service.py`
3. Create endpoints in `api/v1/endpoints/scheduler.py`
4. Create Celery task in `tasks/scheduler_tasks.py`
5. Create scheduler manager in `core/scheduler_manager.py`
6. **Do NOT enable new scheduler yet**

### Verification

```bash
# Test API endpoints manually
curl http://localhost:8000/api/v1/scheduler/job-types
curl http://localhost:8000/api/v1/scheduler/task-functions
curl http://localhost:8000/api/v1/scheduler/status
```

### Rollback

No rollback needed - new code is not active.

---

## Phase 3: Parallel Operation (Low Risk)

### Actions

1. Create default scheduled jobs in database matching current APScheduler jobs
2. Start new scheduler manager **alongside** old scheduler
3. Both systems run jobs (expect duplicates temporarily)
4. Monitor logs for both systems

### Monitoring

```bash
# Watch old scheduler logs
tail -f logs/app.log | grep "apscheduler"

# Watch new scheduler logs
tail -f logs/app.log | grep "scheduler_manager"

# Watch Celery worker
celery -A celery_app worker -Q celery --loglevel=info
```

### Expected Behavior

- Old scheduler runs jobs directly
- New scheduler dispatches to Celery
- Same jobs execute twice (acceptable for cleanup tasks)
- Domain sync may cause double writes (idempotent due to nuclear delete pattern)

### Duration

Run in parallel for **24-48 hours** to verify stability.

---

## Phase 4: Cutover (Critical)

### Pre-Cutover Checklist

- [ ] New scheduler has been stable for 24+ hours
- [ ] All jobs executing successfully via Celery
- [ ] Execution history being recorded
- [ ] No errors in logs
- [ ] UI (if built) shows correct data

### Cutover Steps

#### Step 1: Disable Old Scheduler

**File:** `core/lifespan/tasks.py`

```python
# Comment out old scheduler start
async def start_background_scheduler():
    """Start background scheduler for periodic tasks."""
    # from core.scheduler import start_scheduler
    # ...
    # DISABLED: Old scheduler replaced by database-backed scheduler
    logger = logging.getLogger("main")
    logger.info("Old scheduler disabled - using database-backed scheduler")
    pass


async def shutdown_scheduler_task():
    """Shutdown background scheduler."""
    # DISABLED: Old scheduler replaced
    pass
```

#### Step 2: Enable New Scheduler (If Not Already)

Ensure `scheduler_manager.start()` is called in lifespan.

#### Step 3: Deploy

```bash
# Restart backend workers
sudo systemctl restart backend
# or
docker-compose restart backend
```

#### Step 4: Verify

```bash
# Check no APScheduler logs
tail -f logs/app.log | grep "apscheduler"  # Should be empty

# Check new scheduler is leader
curl http://localhost:8000/api/v1/scheduler/status | jq '.leaderInstance'

# Check jobs are running
curl http://localhost:8000/api/v1/scheduler/jobs | jq '.jobs[].lastRunTime'
```

### Rollback (If Issues)

1. Re-enable old scheduler in `lifespan/tasks.py`
2. Restart backend
3. Debug issues with new system offline

---

## Phase 5: Cleanup (Post-Cutover)

### After 48 Hours of Stable Operation

#### Step 1: Remove Old Scheduler File

```bash
rm src/backend/core/scheduler.py
```

#### Step 2: Clean Up Lifespan Tasks

**File:** `core/lifespan/tasks.py`

Remove the commented-out old scheduler functions entirely.

#### Step 3: Update Imports

Search for any imports of the old scheduler module and remove them.

```bash
grep -r "from core.scheduler" src/backend/
grep -r "from core import scheduler" src/backend/
```

#### Step 4: Remove APScheduler Dependency (Optional)

If APScheduler is still needed for the new scheduler manager, keep it.
If using pure Celery Beat instead, remove:

```bash
uv remove apscheduler
```

---

## Job Migration Details

### Domain User Sync

| Aspect | Old | New |
|--------|-----|-----|
| Handler | `sync_domain_users_job()` | `tasks.ad_sync_tasks.sync_domain_users_task` |
| Execution | In-process async | Celery worker |
| Schedule | `IntervalTrigger(hours=1)` | DB: `{"hours": 1}` |
| Queue | N/A | `ad_queue` |

**Note:** The Celery task already exists. Just need to add to database.

### Token Cleanup

| Aspect | Old | New |
|--------|-----|-----|
| Handler | `cleanup_expired_tokens_job()` | `services.auth_service.auth_service.cleanup_all_expired_sessions` |
| Execution | In-process async | Celery wrapper → async function |
| Schedule | `IntervalTrigger(hours=24)` | DB: `{"hours": 24}` |
| Args | `retention_days=7` | DB: `task_args: {"retention_days": 7}` |

**Note:** Need to create wrapper task for async function.

### Desktop Session Cleanup

| Aspect | Old | New |
|--------|-----|-----|
| Handler | `cleanup_stale_desktop_sessions_job()` | `services.desktop_session_service.DesktopSessionService.cleanup_stale_sessions` |
| Execution | In-process async | Celery wrapper → async function |
| Schedule | `IntervalTrigger(minutes=1)` | DB: `{"minutes": 1}` |
| Args | `timeout_minutes=2` | DB: `task_args: {"timeout_minutes": 2}` |

**Note:** Highest priority migration due to 1-minute frequency.

---

## Default Scheduled Jobs to Create

After migration file runs and task functions are seeded, create these scheduled jobs:

```python
default_jobs = [
    {
        "name": "Domain User Sync (Hourly)",
        "description": "Synchronize domain users from Active Directory every hour",
        "task_function_name": "sync_domain_users",
        "job_type_name": "interval",
        "schedule_config": {"hours": 1, "minutes": 0, "seconds": 0},
        "is_enabled": True,
    },
    {
        "name": "Token Cleanup (Daily)",
        "description": "Clean up expired authentication tokens and sessions daily",
        "task_function_name": "cleanup_expired_tokens",
        "job_type_name": "interval",
        "schedule_config": {"hours": 24, "minutes": 0, "seconds": 0},
        "task_args": {"retention_days": 7},
        "is_enabled": True,
    },
    {
        "name": "Desktop Session Cleanup (Every Minute)",
        "description": "Mark stale desktop sessions as inactive",
        "task_function_name": "cleanup_stale_desktop_sessions",
        "job_type_name": "interval",
        "schedule_config": {"hours": 0, "minutes": 1, "seconds": 0},
        "task_args": {"timeout_minutes": 2},
        "is_enabled": True,
    },
    {
        "name": "Deployment Job Cleanup (30s)",
        "description": "Clean up stale deployment jobs",
        "task_function_name": "cleanup_stale_deployment_jobs",
        "job_type_name": "interval",
        "schedule_config": {"hours": 0, "minutes": 0, "seconds": 30},
        "is_enabled": True,
    },
]
```

---

## Monitoring During Migration

### Key Metrics to Watch

1. **Job execution count**: Should remain consistent
2. **Execution duration**: Should not increase significantly
3. **Error rate**: Should be zero or near-zero
4. **Database connections**: Should decrease after migration (jobs no longer compete)
5. **Celery queue depth**: Should stay low (no backlog)

### Log Searches

```bash
# Successful executions
grep "executed successfully" logs/app.log | tail -20

# Failed executions
grep -i "failed\|error" logs/app.log | grep -i "scheduler\|job" | tail -20

# Leader election
grep "acquired leader" logs/app.log | tail -10

# Job dispatch
grep "Dispatched job" logs/app.log | tail -20
```

### Health Checks

```bash
# Scheduler status endpoint
curl -s http://localhost:8000/api/v1/scheduler/status | jq

# Recent executions
curl -s "http://localhost:8000/api/v1/scheduler/executions?per_page=5" | jq '.executions[] | {job_id, status, started_at}'

# Celery worker status
celery -A celery_app inspect active
celery -A celery_app inspect scheduled
```

---

## Rollback Procedures

### Level 1: Disable New Scheduler Only

Re-enable old scheduler, disable new scheduler manager.

```python
# In lifespan/tasks.py
async def start_background_scheduler():
    from core.scheduler import start_scheduler  # Re-enable
    start_scheduler()
```

### Level 2: Full Rollback

1. Rollback migration: `uv run alembic downgrade -1`
2. Remove new files (keep as backup)
3. Re-enable old scheduler
4. Restart backend

### Level 3: Emergency Rollback

If database is corrupted:

1. Restore database from backup
2. Revert all code changes
3. Restart from clean state

---

## Post-Migration Verification

### Automated Tests

```bash
# Run scheduler tests
pytest tests/test_scheduler_service.py -v
pytest tests/test_scheduler_api.py -v
```

### Manual Verification

1. [ ] All jobs appear in UI
2. [ ] Jobs execute on schedule
3. [ ] Manual trigger works
4. [ ] Execution history shows correct data
5. [ ] Leader election works with multiple workers
6. [ ] Enable/disable works immediately
7. [ ] No old APScheduler logs appearing

### Performance Verification

1. [ ] API response times unchanged
2. [ ] Database connection count stable
3. [ ] Celery queue not backing up
4. [ ] Memory usage stable

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `models/database_models.py` | Add 5 scheduler models |
| `schemas/scheduler/` | Pydantic schemas |
| `services/scheduler_service.py` | Business logic |
| `api/v1/endpoints/scheduler.py` | API endpoints |
| `tasks/scheduler_tasks.py` | Celery task |
| `core/scheduler_manager.py` | New scheduler manager |
| `alembic/versions/...` | Migration file |

### Modified Files

| File | Changes |
|------|---------|
| `api/v1/__init__.py` | Register scheduler router |
| `celery_app.py` | Import scheduler_tasks |
| `core/lifespan/tasks.py` | Use new scheduler manager |
| `database_setup.py` | Seed scheduler data |

### Deleted Files

| File | When |
|------|------|
| `core/scheduler.py` | After 48h stable operation |

---

## Success Criteria

Migration is complete when:

1. All jobs managed via database configuration
2. All jobs execute via Celery workers
3. Execution history tracked in database
4. UI available for job management
5. Old scheduler code removed
6. No duplicate executions
7. Zero downtime achieved
