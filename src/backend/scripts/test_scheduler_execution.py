#!/usr/bin/env python
"""
Scheduler Execution Test Script

Tests that all scheduled tasks can be executed successfully by:
1. Directly calling the wrapper functions
2. Using the scheduler execution path

This script performs ACTUAL execution (not just validation).
Run from backend directory:
    uv run python scripts/test_scheduler_execution.py
"""

import asyncio
import sys
from pathlib import Path
from typing import Dict, Any, List, Tuple
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


async def test_cleanup_expired_sessions() -> Tuple[bool, str, Dict[str, Any]]:
    """Test cleanup_expired_sessions_task."""
    from tasks.maintenance_tasks import cleanup_expired_sessions_task

    try:
        result = await cleanup_expired_sessions_task(retention_days=7)
        return True, "Success", result
    except Exception as e:
        return False, str(e), {}


async def test_cleanup_stale_desktop_sessions() -> Tuple[bool, str, Dict[str, Any]]:
    """Test cleanup_stale_desktop_sessions_task."""
    from tasks.maintenance_tasks import cleanup_stale_desktop_sessions_task

    try:
        result = await cleanup_stale_desktop_sessions_task(timeout_minutes=2)
        return True, "Success", result
    except Exception as e:
        return False, str(e), {}


async def test_cleanup_stale_deployment_jobs() -> Tuple[bool, str, Dict[str, Any]]:
    """Test cleanup_stale_deployment_jobs_task."""
    from tasks.maintenance_tasks import cleanup_stale_deployment_jobs_task

    try:
        result = await cleanup_stale_deployment_jobs_task(timeout_minutes=60)
        return True, "Success", result
    except Exception as e:
        return False, str(e), {}


async def test_cleanup_old_job_executions() -> Tuple[bool, str, Dict[str, Any]]:
    """Test cleanup_old_job_executions_task."""
    from tasks.maintenance_tasks import cleanup_old_job_executions_task

    try:
        result = await cleanup_old_job_executions_task(retention_days=90)
        return True, "Success", result
    except Exception as e:
        return False, str(e), {}


async def test_via_execute_async_function(
    handler_path: str,
    task_args: Dict[str, Any]
) -> Tuple[bool, str, Dict[str, Any]]:
    """Test a task via the scheduler's _execute_async_function."""
    from tasks.scheduler_tasks import _execute_async_function

    try:
        result = await _execute_async_function(handler_path, task_args)
        return True, "Success", result
    except Exception as e:
        return False, str(e), {}


async def main():
    """Run all tests."""
    print("=" * 70)
    print("SCHEDULER EXECUTION TESTS")
    print("=" * 70)
    print(f"Started: {datetime.utcnow().isoformat()}")
    print()

    all_passed = True
    results = []

    # Test 1: Direct function calls
    print("=" * 70)
    print("PART 1: DIRECT WRAPPER FUNCTION CALLS")
    print("=" * 70)
    print()

    direct_tests = [
        ("cleanup_expired_sessions", test_cleanup_expired_sessions),
        ("cleanup_stale_desktop_sessions", test_cleanup_stale_desktop_sessions),
        ("cleanup_stale_deployment_jobs", test_cleanup_stale_deployment_jobs),
        ("cleanup_old_job_executions", test_cleanup_old_job_executions),
    ]

    for name, test_func in direct_tests:
        print(f"Testing {name}...", end=" ", flush=True)
        success, msg, result = await test_func()

        if success:
            print(f"✅ PASS")
            print(f"    Result: {result}")
        else:
            print(f"❌ FAIL")
            print(f"    Error: {msg}")
            all_passed = False

        results.append((name, "direct", success, msg))
        print()

    # Test 2: Via _execute_async_function (simulates scheduler execution)
    print("=" * 70)
    print("PART 2: VIA SCHEDULER EXECUTION PATH (_execute_async_function)")
    print("=" * 70)
    print()

    scheduler_tests = [
        (
            "cleanup_expired_sessions",
            "tasks.maintenance_tasks.cleanup_expired_sessions_task",
            {"retention_days": 7}
        ),
        (
            "cleanup_stale_desktop_sessions",
            "tasks.maintenance_tasks.cleanup_stale_desktop_sessions_task",
            {"timeout_minutes": 2}
        ),
        (
            "cleanup_stale_deployment_jobs",
            "tasks.maintenance_tasks.cleanup_stale_deployment_jobs_task",
            {"timeout_minutes": 60}
        ),
        (
            "cleanup_old_job_executions",
            "tasks.maintenance_tasks.cleanup_old_job_executions_task",
            {"retention_days": 90}
        ),
    ]

    for name, handler_path, task_args in scheduler_tests:
        print(f"Testing {name} via scheduler path...", end=" ", flush=True)
        success, msg, result = await test_via_execute_async_function(handler_path, task_args)

        if success:
            print(f"✅ PASS")
            print(f"    Result: {result}")
        else:
            print(f"❌ FAIL")
            print(f"    Error: {msg}")
            all_passed = False

        results.append((name, "scheduler", success, msg))
        print()

    # Summary
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)

    passed_count = sum(1 for r in results if r[2])
    failed_count = len(results) - passed_count

    print(f"Total tests: {len(results)}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {failed_count}")
    print()

    if all_passed:
        print("✅ ALL EXECUTION TESTS PASSED")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        print("\nFailed tests:")
        for name, method, success, msg in results:
            if not success:
                print(f"  - {name} ({method}): {msg}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
