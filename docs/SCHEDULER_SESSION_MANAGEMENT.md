# Scheduler Session Management Patterns

## Problem: asyncpg "cannot perform operation: another operation is in progress"

When scheduler tasks call other async functions that perform database operations, we can encounter this error:

```
sqlalchemy.exc.InterfaceError: (sqlalchemy.dialects.postgresql.asyncpg.InterfaceError)
<class 'asyncpg.exceptions._base.InterfaceError'>: cannot perform operation: another operation is in progress
```

### Root Cause

1. **Nested Session Creation**: A scheduler task creates a session via `get_celery_session()`, then calls sub-functions that also create their own sessions
2. **Transaction Boundary Confusion**: Service methods call `db.commit()` which interferes with the caller's transaction management
3. **Connection Pool Exhaustion**: Multiple concurrent operations on the same connection pool cause conflicts

## Solution: Isolated Session Pattern

The solution is to use **separate isolated sessions for each phase** of the operation:

```python
# ❌ WRONG - Nested sessions cause errors
async def wrong_execute(job_id, execution_id):
    async with get_celery_session() as db:
        # Load job
        job = await load_job(db, job_id)

        # Update execution
        await update_execution(db, execution_id, "running")

        # Call sub-task that creates its own session - ERROR!
        result = await some_sub_task(job.args)  # This calls get_celery_session() again

        # Record completion
        await update_execution(db, execution_id, "success", result)
```

```python
# ✅ CORRECT - Isolated sessions
async def correct_execute(job_id, execution_id):
    # Phase 1: Load and initialize
    async with get_celery_session() as db:
        job = await load_job(db, job_id)
        await update_execution(db, execution_id, "running")
        await db.commit()  # Commit before moving to next phase

    # Phase 2: Execute (sub-task creates its own session)
    result = await some_sub_task(job.args)  # This is safe - separate session

    # Phase 3: Record completion
    async with get_celery_session() as db:
        await update_execution(db, execution_id, "success", result)
        await db.commit()  # Final commit
```

## Implementation in `tasks/scheduler_tasks.py`

The `_async_execute` function follows this pattern:

```python
async def _async_execute(job_id: str, execution_id: str, triggered_by: str = "scheduler") -> dict:
    # Phase 1: Load job and update execution status
    async with get_celery_session() as db:
        job = await load_job(db, job_id)
        await scheduler_service.record_execution_start(db, execution_id, celery_task_id)
        await db.commit()  # Explicit commit

    # Phase 2: Execute the task
    try:
        result_data = await _execute_celery_task(handler_path, task_args)
        status = "success"
    except Exception as e:
        status = "failed"

    # Phase 3: Record completion
    async with get_celery_session() as db:
        await scheduler_service.record_execution_complete(db, execution_id, status, result_data)
        await db.commit()  # Final commit
```

## Service Layer Changes

Service methods used by scheduler tasks should **NOT commit** - they should use `flush()` for immediate visibility:

```python
# ❌ WRONG - Service commits transaction
async def record_execution_start(self, db, execution_id, celery_task_id):
    await db.execute(update_statement)
    await db.commit()  # Don't commit! Let caller manage transaction
```

```python
# ✅ CORRECT - Service flushes for visibility
async def record_execution_start(self, db, execution_id, celery_task_id):
    await db.execute(update_statement)
    await db.flush()  # Flush for visibility, caller commits
```

## Guidelines for Sub-Task Functions

Functions called by scheduler tasks (`maintenance_tasks.py`) should:

1. **Always create their own session** via `get_celery_session()`
2. **Never accept a `db` parameter** from the caller
3. **Commit their own work** before returning

```python
# ✅ CORRECT - Wrapper function pattern
async def cleanup_expired_sessions_task(retention_days: int = 7) -> Dict[str, Any]:
    """
    Wrapper function for scheduler.

    Creates its own session - do NOT pass db parameter.
    """
    async with get_celery_session() as db:
        service = AuthenticationService()
        result = await service.cleanup_all_expired_sessions(db, retention_days)
    return result
```

## Testing

Use the test script to verify session management:

```bash
cd src/backend
uv run python test_scheduler_tasks.py
```

This tests:
1. Session isolation between different task types
2. Connection pool handling under concurrent load
3. End-to-end execution flow

## Key Takeaways

1. **Never share sessions across async function boundaries**
2. **Use separate sessions for each phase of an operation**
3. **Service methods should use flush(), not commit()**
4. **Sub-tasks must create their own sessions**
5. **Commit each phase before starting the next**
