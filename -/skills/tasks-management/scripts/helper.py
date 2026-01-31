#!/usr/bin/env python3
"""
Tasks Management Helper Script

Utilities for managing APScheduler jobs and Celery tasks.

Usage:
    python helper.py list-jobs       # List all scheduled jobs
    python helper.py list-tasks      # List registered Celery tasks
    python helper.py check           # Validate task configuration
    python helper.py run JOB_ID      # Trigger job execution
    python helper.py generate NAME   # Generate new task template
"""

import sys
import os
import json

def list_scheduled_jobs():
    """List all scheduled jobs from database."""
    print("Listing scheduled jobs...")
    
    try:
        sys.path.insert(0, os.getcwd())
        from db.session import get_sync_db
        from models.scheduler import ScheduledJob
        
        with get_sync_db() as db:
            jobs = db.query(ScheduledJob).all()
            
            if not jobs:
                print("No scheduled jobs found.")
                return
            
            print(f"\n{'Name':<30} {'Task':<30} {'Trigger':<10} {'Enabled':<8}")
            print("-" * 80)
            
            for job in jobs:
                print(f"{job.name:<30} {job.task_name:<30} {job.trigger_type:<10} {'✓' if job.is_enabled else '✗':<8}")
            
            print(f"\nTotal: {len(jobs)} jobs")
            
    except ImportError as e:
        print(f"Cannot import database modules: {e}")
        print("Make sure you're in the project root directory.")

def list_celery_tasks():
    """List all registered Celery tasks."""
    print("Listing Celery tasks...")
    
    try:
        sys.path.insert(0, os.getcwd())
        from celery_app import celery_app
        
        tasks = sorted(celery_app.tasks.keys())
        
        # Filter out built-in tasks
        app_tasks = [t for t in tasks if not t.startswith('celery.')]
        
        print(f"\nRegistered tasks ({len(app_tasks)}):")
        for task in app_tasks:
            print(f"  - {task}")
        
    except ImportError as e:
        print(f"Cannot import celery_app: {e}")

def check_configuration():
    """Validate task management configuration."""
    print("Checking task configuration...")
    
    issues = []
    
    # Check celery_app.py
    if os.path.exists('celery_app.py'):
        print("✓ celery_app.py found")
        
        with open('celery_app.py', 'r') as f:
            content = f.read()
            
            if 'task_acks_late' not in content:
                issues.append("⚠ celery_app.py: task_acks_late not configured")
            
            if 'include=' not in content and 'imports=' not in content:
                issues.append("⚠ celery_app.py: No task modules imported")
    else:
        issues.append("✗ celery_app.py not found")
    
    # Check tasks directory
    if os.path.isdir('tasks'):
        print("✓ tasks/ directory found")
        
        task_files = [f for f in os.listdir('tasks') if f.endswith('.py') and f != '__init__.py']
        print(f"  Found {len(task_files)} task files")
        
        # Check for celery_bridge
        if os.path.exists('tasks/celery_bridge.py'):
            print("✓ tasks/celery_bridge.py found")
        else:
            issues.append("⚠ tasks/celery_bridge.py not found")
    else:
        issues.append("⚠ tasks/ directory not found")
    
    # Check scheduler service
    if os.path.exists('api/services/scheduler_service.py'):
        print("✓ api/services/scheduler_service.py found")
    else:
        issues.append("ℹ api/services/scheduler_service.py not found (optional)")
    
    # Check models
    if os.path.exists('models/scheduler.py'):
        print("✓ models/scheduler.py found")
    else:
        issues.append("ℹ models/scheduler.py not found (optional)")
    
    if issues:
        print("\nIssues found:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("\n✓ Configuration check passed!")

def trigger_job(job_id: str):
    """Trigger immediate job execution."""
    print(f"Triggering job: {job_id}")
    
    try:
        sys.path.insert(0, os.getcwd())
        import asyncio
        from db.session import get_db
        from api.services.scheduler_service import SchedulerService
        
        async def run():
            async with get_db() as db:
                service = SchedulerService(db)
                execution_id = await service.run_now(job_id)
                print(f"✓ Job triggered. Execution ID: {execution_id}")
        
        asyncio.run(run())
        
    except ImportError as e:
        print(f"Cannot import modules: {e}")
    except Exception as e:
        print(f"Error triggering job: {e}")

def generate_task(name: str):
    """Generate a new task file template."""
    os.makedirs('tasks', exist_ok=True)
    
    filename = f"tasks/{name}.py"
    
    if os.path.exists(filename):
        confirm = input(f"{filename} exists. Overwrite? (y/N): ")
        if confirm.lower() != 'y':
            print("Cancelled.")
            return
    
    template = f'''"""
{name.replace('_', ' ').title()} Tasks

Background tasks for {name}.
"""

from celery import shared_task
from celery.utils.log import get_task_logger
import asyncio

logger = get_task_logger(__name__)


def _run_async(coro):
    """Run async code in Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    soft_time_limit=120,
    time_limit=180,
)
def {name}_task(self, execution_id: str = None, **kwargs):
    """
    {name.replace('_', ' ').title()} Task
    
    Args:
        execution_id: Execution tracking ID from scheduler
        **kwargs: Task parameters
    
    Returns:
        dict: Task result
    """
    logger.info(f"Starting {name}_task [execution={{execution_id}}]")
    
    async def _execute():
        # TODO: Implement async task logic
        # Example:
        # from services.{name}_service import {name.title()}Service
        # service = {name.title()}Service()
        # result = await service.process(**kwargs)
        # return result
        return {{"status": "completed"}}
    
    try:
        result = _run_async(_execute())
        logger.info(f"Completed {name}_task: {{result}}")
        return result
        
    except Exception as e:
        logger.error(f"Failed {name}_task: {{e}}")
        raise


# Register with scheduler (optional)
# To schedule this task, use:
# scheduler_service.create_job(
#     name="{name}_job",
#     task_name="tasks.{name}.{name}_task",
#     trigger_type="interval",
#     trigger_args={{"hours": 1}},
#     kwargs={{}}
# )
'''
    
    with open(filename, 'w') as f:
        f.write(template)
    
    print(f"✓ Created {filename}")
    print(f"\nRemember to add to celery_app.py:")
    print(f'  include=["tasks.{name}"]')

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'list-jobs':
        list_scheduled_jobs()
    elif command == 'list-tasks':
        list_celery_tasks()
    elif command == 'check':
        check_configuration()
    elif command == 'run' and len(sys.argv) > 2:
        trigger_job(sys.argv[2])
    elif command == 'generate' and len(sys.argv) > 2:
        generate_task(sys.argv[2])
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
