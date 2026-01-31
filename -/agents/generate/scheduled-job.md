---
name: generate-scheduled-job
description: Generate APScheduler scheduled job with database persistence. Use when user needs recurring background jobs.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Scheduled Job Generation Agent

Generate APScheduler jobs with database persistence, distributed locking, and Celery integration.

## When This Agent Activates

- User requests: "Create a scheduled job for [operation]"
- User requests: "Add cron job for [operation]"
- User requests: "Schedule [operation] to run [frequency]"
- Command: `/generate job [name]`

## Agent Lifecycle

### Phase 1: Detection

**Check for APScheduler setup:**

```bash
# Check for APScheduler
cat requirements.txt pyproject.toml 2>/dev/null | grep -i "apscheduler"

# Check for scheduler configuration
ls scheduler.py scheduler/*.py 2>/dev/null

# Check for Celery integration
grep -l "celery\|beat" scheduler/*.py 2>/dev/null
```

**Decision Tree:**

```
IF no APScheduler installed:
    → "APScheduler not found. Would you like to set it up?"
    → Suggest: /scaffold tasks-management

IF scheduler not configured:
    → "Scheduler configuration not found."
    → "Would you like me to create the base configuration?"

IF scheduler ready:
    → Proceed to dialogue
```

### Phase 2: Interactive Dialogue

```markdown
## Scheduled Job Configuration

I'll help you create a new scheduled job.

### Required Information

**1. Job Name**
What should this job be called?
- Format: snake_case with descriptive name
- Example: `daily_report`, `hourly_sync`, `cleanup_old_data`

**2. Job Purpose**
What does this job do?
- Brief description of the scheduled operation

**3. Schedule Type**
How often should this job run?

- [ ] **Interval** - Every X minutes/hours/days
- [ ] **Cron** - Cron expression (more flexible)

### If Interval:

**Interval Settings**
- Run every: ___ (number)
- Unit: [ ] seconds [ ] minutes [ ] hours [ ] days [ ] weeks

### If Cron:

**Cron Expression**
```
minute: ___ (0-59, *)
hour: ___ (0-23, *)
day: ___ (1-31, *)
month: ___ (1-12, *)
day_of_week: ___ (0-6, mon-sun, *)
```

Common presets:
- [ ] Every minute: `* * * * *`
- [ ] Every hour: `0 * * * *`
- [ ] Daily at midnight: `0 0 * * *`
- [ ] Daily at 6 AM: `0 6 * * *`
- [ ] Weekly on Monday: `0 0 * * 1`
- [ ] Monthly on 1st: `0 0 1 * *`
- [ ] Custom: ___________

### Job Configuration

**4. Execution Mode**
How should this job execute?

- [ ] **Inline** - Run directly in scheduler process
- [ ] **Celery** - Dispatch to Celery worker [recommended for heavy tasks]

**5. Concurrency**
Can multiple instances run simultaneously?

- [ ] No - Skip if previous run still executing [recommended]
- [ ] Yes - Allow concurrent executions

**6. Misfire Handling**
If the scheduler was down when job should run:

- [ ] Run once when scheduler starts
- [ ] Skip missed runs
- [ ] Run all missed executions

**7. Timezone**
- [ ] UTC (default)
- [ ] Local timezone: ___________

### Job Parameters

**8. Input Parameters**
Does this job need any configuration parameters?

Format: `param_name: type = default_value`

Example:
```
batch_size: int = 100
notify_on_complete: bool = True
```
```

### Phase 3: Generation Plan

```markdown
## Generation Plan

Job: **{job_name}**
Schedule: {schedule_description}

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `scheduler/jobs/{job_name}.py` | Create | Job implementation |
| `scheduler/config.py` | Modify | Register job |

### Job Implementation

```python
from apscheduler.triggers.cron import CronTrigger
from scheduler.base import BaseJob

class {JobName}Job(BaseJob):
    """
    {description}

    Schedule: {schedule_description}
    """

    name = "{job_name}"
    trigger = CronTrigger({cron_params})
    max_instances = 1
    coalesce = True
    misfire_grace_time = 300

    async def execute(self, {params}):
        """Execute the scheduled job."""
        # Job implementation here
        self.log.info("Job {job_name} started")

        try:
            # Your job logic
            result = await self._do_work()
            self.log.info(f"Job completed: {result}")
            return result
        except Exception as e:
            self.log.error(f"Job failed: {e}")
            raise
```

### Schedule Details

| Property | Value |
|----------|-------|
| Name | {job_name} |
| Trigger | {cron/interval} |
| Schedule | {human_readable} |
| Next run | {calculated_next_run} |
| Timezone | {timezone} |
| Max instances | {max_instances} |
| Celery dispatch | {yes/no} |

**Confirm?** Reply "yes" to generate.
```

### Phase 4: Code Generation

**Read skill references:**

1. Read `skills/tasks-management/references/scheduler-pattern.md`
2. Read `skills/tasks-management/references/task-pattern.md`

**Generate with patterns:**

- Proper trigger configuration
- Database persistence
- Distributed locking
- Execution history tracking
- Celery integration (if selected)

### Phase 5: Next Steps

```markdown
## Generation Complete

Scheduled job **{job_name}** has been created.

### Files Created

- [x] `scheduler/jobs/{job_name}.py`
- [x] `scheduler/config.py` (modified)

### Test the Job

```bash
# Start the scheduler
python scheduler/main.py

# Or run job manually
python -c "from scheduler.jobs.{job_name} import {JobName}Job; asyncio.run({JobName}Job().execute())"
```

### Schedule Verification

```
Job: {job_name}
Schedule: {schedule_description}
Next 5 runs:
  1. {next_run_1}
  2. {next_run_2}
  3. {next_run_3}
  4. {next_run_4}
  5. {next_run_5}
```

### Related Actions

- [ ] **Add monitoring** for job execution?
- [ ] **Create Celery task** that this job dispatches?
      → `/generate task {job_name}-worker`
- [ ] **Add alerting** on job failure?
```
