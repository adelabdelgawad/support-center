#!/usr/bin/env python3
"""
Celery Worker Helper Script

Utilities for managing Celery workers and tasks.

Usage:
    python helper.py check          # Check Celery configuration
    python helper.py status         # Show worker status
    python helper.py tasks          # List registered tasks
    python helper.py purge          # Purge all pending tasks
    python helper.py inspect        # Inspect active tasks
"""

import sys
import subprocess
import os

def check_celery_config():
    """Validate celery_app.py configuration."""
    print("Checking Celery configuration...")
    
    required_settings = [
        'task_acks_late',
        'task_reject_on_worker_lost',
        'task_track_started',
        'task_soft_time_limit',
        'task_time_limit',
    ]
    
    try:
        # Try to import celery_app
        sys.path.insert(0, os.getcwd())
        from celery_app import celery_app
        
        print(f"✓ Celery app loaded: {celery_app.main}")
        print(f"✓ Broker: {celery_app.conf.broker_url}")
        print(f"✓ Backend: {celery_app.conf.result_backend}")
        
        # Check required settings
        for setting in required_settings:
            value = getattr(celery_app.conf, setting, None)
            if value is not None:
                print(f"✓ {setting}: {value}")
            else:
                print(f"⚠ {setting}: NOT SET (recommended)")
        
        # Check reliability settings
        if celery_app.conf.task_acks_late:
            print("✓ Reliability: task_acks_late enabled")
        else:
            print("⚠ Reliability: task_acks_late is False (tasks may be lost on worker crash)")
        
        # Check time limits
        soft = celery_app.conf.task_soft_time_limit
        hard = celery_app.conf.task_time_limit
        if soft and hard:
            if hard > soft:
                print(f"✓ Time limits: soft={soft}s, hard={hard}s")
            else:
                print(f"⚠ Time limits: hard ({hard}) should be > soft ({soft})")
        
        print("\n✓ Configuration check passed!")
        return True
        
    except ImportError as e:
        print(f"✗ Cannot import celery_app: {e}")
        return False
    except Exception as e:
        print(f"✗ Error checking configuration: {e}")
        return False

def show_worker_status():
    """Show status of running workers."""
    print("Checking worker status...")
    result = subprocess.run(
        ['celery', '-A', 'celery_app', 'inspect', 'ping'],
        capture_output=True,
        text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")

def list_registered_tasks():
    """List all registered tasks."""
    print("Registered tasks:")
    result = subprocess.run(
        ['celery', '-A', 'celery_app', 'inspect', 'registered'],
        capture_output=True,
        text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")

def purge_tasks():
    """Purge all pending tasks."""
    confirm = input("This will delete ALL pending tasks. Continue? (y/N): ")
    if confirm.lower() == 'y':
        result = subprocess.run(
            ['celery', '-A', 'celery_app', 'purge', '-f'],
            capture_output=True,
            text=True
        )
        print(result.stdout)
    else:
        print("Cancelled.")

def inspect_active():
    """Inspect active tasks on workers."""
    print("Active tasks:")
    result = subprocess.run(
        ['celery', '-A', 'celery_app', 'inspect', 'active'],
        capture_output=True,
        text=True
    )
    print(result.stdout)
    
    print("\nReserved tasks:")
    result = subprocess.run(
        ['celery', '-A', 'celery_app', 'inspect', 'reserved'],
        capture_output=True,
        text=True
    )
    print(result.stdout)

def generate_task_template(task_name: str):
    """Generate a new task file template."""
    template = f'''from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)

@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    soft_time_limit=120,
    time_limit=180,
)
def {task_name}(self, execution_id: str = None, **kwargs):
    """
    {task_name.replace('_', ' ').title()}
    
    Args:
        execution_id: Optional execution tracking ID
        **kwargs: Task arguments
    
    Returns:
        dict: Task result
    """
    logger.info(f"Starting {task_name}")
    
    try:
        # TODO: Implement task logic
        result = {{"status": "completed"}}
        
        logger.info(f"Completed {task_name}: {{result}}")
        return result
        
    except Exception as e:
        logger.error(f"Failed {task_name}: {{e}}")
        raise
'''
    
    filename = f"tasks/{task_name}.py"
    os.makedirs("tasks", exist_ok=True)
    
    with open(filename, 'w') as f:
        f.write(template)
    
    print(f"✓ Created {filename}")
    print(f"  Don't forget to add '{task_name}' to celery_app.conf.include")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    commands = {
        'check': check_celery_config,
        'status': show_worker_status,
        'tasks': list_registered_tasks,
        'purge': purge_tasks,
        'inspect': inspect_active,
    }
    
    if command == 'generate' and len(sys.argv) > 2:
        generate_task_template(sys.argv[2])
    elif command in commands:
        commands[command]()
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
