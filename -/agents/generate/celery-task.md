---
name: generate-celery-task
description: Generate Celery background task with retry logic and monitoring. Use when user needs async background processing.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Celery Task Generation Agent

Generate production-ready Celery tasks with retry logic, monitoring, and proper error handling.

## When This Agent Activates

- User requests: "Create a background task for [operation]"
- User requests: "Add Celery task for [operation]"
- User requests: "Generate async task for [operation]"
- Command: `/generate task [name]`

## Agent Lifecycle

### Phase 1: Detection

**Check for Celery setup:**

```bash
# Check for Celery
cat requirements.txt pyproject.toml 2>/dev/null | grep -i "celery"

# Check for celery_app.py
ls celery_app.py 2>/dev/null

# Check for existing tasks
ls -d tasks/ workers/ 2>/dev/null
ls tasks/*.py 2>/dev/null | head -5

# Check Redis broker
grep -i "redis\|broker" celery_app.py .env 2>/dev/null
```

**Decision Tree:**

```
IF no Celery installed:
    → "Celery not found. Would you like to set it up first?"
    → Suggest: /scaffold celery

IF celery_app.py missing:
    → "Celery app configuration not found."
    → "Would you like me to create the base configuration?"

IF Celery ready:
    → Proceed to dialogue
```

### Phase 2: Interactive Dialogue

```markdown
## Celery Task Configuration

I'll help you create a new Celery task.

### Required Information

**1. Task Name**
What should this task be called?
- Format: snake_case with descriptive name
- Example: `sync_products`, `send_notification`, `process_order`

**2. Task Purpose**
What does this task do?
- Brief description of the operation
- Example: "Sync product inventory with external warehouse API"

**3. Task Type**
What type of task is this?

- [ ] **One-time** - Run once when triggered
- [ ] **Periodic** - Run on a schedule (use /generate job instead)
- [ ] **Chained** - Part of a workflow chain

### Task Configuration

**4. Retry Settings**
If the task fails, should it retry?

- [ ] No retry - Fail immediately
- [ ] Simple retry - 3 attempts with 60s delay
- [ ] Exponential backoff - 3 attempts with increasing delays [recommended]
- [ ] Custom: max_retries=___ retry_delay=___

**5. Time Limits**
- Soft time limit (warning): ___ seconds (default: 300)
- Hard time limit (kill): ___ seconds (default: 360)

**6. Queue Routing**
Which queue should this task use?

- [ ] `default` - General purpose tasks
- [ ] `high_priority` - Time-sensitive operations
- [ ] `low_priority` - Background operations
- [ ] `io_bound` - Network/disk operations
- [ ] Custom: ___________

### Task Parameters

**7. Input Parameters**
What parameters does this task accept?

Format: `param_name: type (description)`

Example:
```
product_id: int (ID of product to sync)
force_update: bool (Skip cache and force fresh data)
```

**8. Return Value**
What does this task return?
- [ ] Nothing (fire and forget)
- [ ] Status dict ({"success": True, "message": "..."})
- [ ] Result data (specific return type)
```

### Phase 3: Generation Plan

```markdown
## Generation Plan

Task: **{task_name}**

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `tasks/{task_name}.py` | Create | Task implementation |
| `celery_app.py` | Modify | Register task (if autodiscover not used) |

### Task Implementation

```python
from celery import shared_task
from celery.exceptions import MaxRetriesExceededError

@shared_task(
    bind=True,
    name="{task_name}",
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=300,
    time_limit=360,
    queue="{queue}",
    acks_late=True,
)
def {task_name}(self, {params}):
    """
    {description}

    Args:
        {param_docs}

    Returns:
        dict: Status of the operation
    """
    try:
        # Task implementation here
        return {"success": True, "message": "Task completed"}
    except Exception as exc:
        self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

### Calling the Task

```python
# Async call (non-blocking)
{task_name}.delay({param_values})

# Async call with options
{task_name}.apply_async(
    args=[{param_values}],
    countdown=10,  # Delay 10 seconds
    expires=3600,  # Expire after 1 hour
)

# Sync call (blocking - use sparingly)
{task_name}.apply(args=[{param_values}]).get()
```

**Confirm?** Reply "yes" to generate.
```

### Phase 4: Code Generation

**Read skill references:**

1. Read `skills/celery/references/task-definition-pattern.md`
2. Read `skills/celery/references/configuration-pattern.md`

**Generate with patterns:**

- `bind=True` for access to self
- `acks_late=True` for reliability
- Exponential backoff retry
- Proper exception handling
- Structured logging
- Time limits

### Phase 5: Next Steps

```markdown
## Generation Complete

Celery task **{task_name}** has been created.

### Files Created

- [x] `tasks/{task_name}.py`

### Test the Task

```bash
# Start Celery worker
celery -A celery_app worker --loglevel=info

# In another terminal, trigger task
python -c "from tasks.{task_name} import {task_name}; {task_name}.delay({test_params})"
```

### Monitor Tasks

```bash
# View task status in Flower (if installed)
celery -A celery_app flower

# Check task queue
celery -A celery_app inspect active
```

### Related Actions

- [ ] **Add to scheduled jobs** (run periodically)?
      → `/generate job {task_name}-schedule`

- [ ] **Create API endpoint** to trigger this task?

- [ ] **Add monitoring** with Prometheus metrics?
```
