#!/usr/bin/env python
"""
Scheduled Tasks Validation Script

Validates all scheduled tasks by:
1. Resolving callable paths
2. Checking function signatures
3. Verifying dependencies exist
4. Reporting issues without executing

Run from backend directory:
    python scripts/validate_scheduled_tasks.py
"""

import asyncio
import importlib
import inspect
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


# Task definitions matching seed data
TASK_FUNCTIONS = [
    {
        "name": "sync_domain_users",
        "handler_path": "tasks.ad_sync_tasks.sync_domain_users_task",
        "handler_type": "celery_task",
        "expected_args": [],
    },
    {
        "name": "cleanup_expired_tokens",
        "handler_path": "tasks.maintenance_tasks.cleanup_expired_sessions_task",
        "handler_type": "async_function",
        "expected_args": ["retention_days"],
    },
    {
        "name": "cleanup_stale_desktop_sessions",
        "handler_path": "tasks.maintenance_tasks.cleanup_stale_desktop_sessions_task",
        "handler_type": "async_function",
        "expected_args": ["timeout_minutes"],
    },
    {
        "name": "cleanup_stale_deployment_jobs",
        "handler_path": "tasks.maintenance_tasks.cleanup_stale_deployment_jobs_task",
        "handler_type": "async_function",
        "expected_args": ["timeout_minutes"],
    },
    {
        "name": "cleanup_old_job_executions",
        "handler_path": "tasks.maintenance_tasks.cleanup_old_job_executions_task",
        "handler_type": "async_function",
        "expected_args": ["retention_days"],
    },
]


class ValidationResult:
    def __init__(self, name: str):
        self.name = name
        self.passed = True
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.info: List[str] = []

    def add_error(self, msg: str):
        self.errors.append(msg)
        self.passed = False

    def add_warning(self, msg: str):
        self.warnings.append(msg)

    def add_info(self, msg: str):
        self.info.append(msg)


def resolve_callable(handler_path: str) -> Tuple[Any, str]:
    """
    Resolve a dotted path to a callable.

    Returns:
        Tuple of (callable, error_message)
        If error_message is not empty, callable may be None
    """
    parts = handler_path.split(".")

    # Try to find the module by progressively importing
    module = None
    module_parts_count = 0

    for i in range(len(parts), 0, -1):
        test_path = ".".join(parts[:i])
        try:
            module = importlib.import_module(test_path)
            module_parts_count = i
            break
        except (ImportError, ModuleNotFoundError) as e:
            continue

    if module is None:
        return None, f"Could not import any module for path: {handler_path}"

    # Navigate to the callable
    obj = module
    remaining_parts = parts[module_parts_count:]

    for part in remaining_parts:
        if not hasattr(obj, part):
            return None, f"Attribute '{part}' not found in {obj.__name__}"
        obj = getattr(obj, part)

    return obj, ""


def validate_celery_task(result: ValidationResult, handler_path: str, callable_obj: Any):
    """Validate a Celery task callable."""
    # Check if it's a Celery task
    if not hasattr(callable_obj, 'apply_async'):
        result.add_error(f"Not a Celery task (missing apply_async): {handler_path}")
        return

    if not hasattr(callable_obj, 'delay'):
        result.add_warning(f"Missing 'delay' method (unusual for Celery task): {handler_path}")

    # Check task name
    if hasattr(callable_obj, 'name'):
        result.add_info(f"Celery task name: {callable_obj.name}")

    result.add_info(f"✓ Valid Celery task")


def validate_async_function(result: ValidationResult, handler_path: str, callable_obj: Any, expected_args: List[str]):
    """Validate an async function callable."""
    # Check if it's actually async
    if not asyncio.iscoroutinefunction(callable_obj):
        result.add_error(f"Not an async function: {handler_path}")
        return

    # Check signature
    sig = inspect.signature(callable_obj)
    params = list(sig.parameters.keys())

    # Check for forbidden parameters
    forbidden = ['self', 'cls', 'db', 'session', 'request']
    for param in params:
        if param in forbidden:
            result.add_error(
                f"Function has forbidden parameter '{param}'. "
                f"Async functions must be standalone wrappers that handle their own DI."
            )

    # Check for required parameters without defaults
    required_params = []
    for name, param in sig.parameters.items():
        if param.default == inspect.Parameter.empty and param.kind not in (
            inspect.Parameter.VAR_POSITIONAL,
            inspect.Parameter.VAR_KEYWORD
        ):
            required_params.append(name)

    if required_params:
        result.add_warning(
            f"Function has required parameters without defaults: {required_params}. "
            f"These must be provided via task_args."
        )

    # Check expected args are in signature
    for expected in expected_args:
        if expected not in params:
            result.add_warning(f"Expected parameter '{expected}' not found in signature")

    result.add_info(f"✓ Valid async function with params: {params}")


def validate_task(task_def: Dict[str, Any]) -> ValidationResult:
    """Validate a single task definition."""
    result = ValidationResult(task_def["name"])

    handler_path = task_def["handler_path"]
    handler_type = task_def["handler_type"]

    result.add_info(f"Handler: {handler_path}")
    result.add_info(f"Type: {handler_type}")

    # Step 1: Resolve callable
    callable_obj, error = resolve_callable(handler_path)

    if error:
        result.add_error(f"Resolution failed: {error}")
        return result

    if callable_obj is None:
        result.add_error(f"Callable resolved to None")
        return result

    # Step 2: Type-specific validation
    if handler_type == "celery_task":
        validate_celery_task(result, handler_path, callable_obj)
    elif handler_type == "async_function":
        validate_async_function(result, handler_path, callable_obj, task_def.get("expected_args", []))
    else:
        result.add_error(f"Unknown handler type: {handler_type}")

    return result


def main():
    """Run validation for all tasks."""
    print("=" * 70)
    print("SCHEDULED TASKS VALIDATION REPORT")
    print("=" * 70)
    print()

    all_passed = True
    results = []

    for task_def in TASK_FUNCTIONS:
        result = validate_task(task_def)
        results.append(result)

        if not result.passed:
            all_passed = False

        # Print result
        status = "✅ PASS" if result.passed else "❌ FAIL"
        print(f"[{status}] {result.name}")

        for info in result.info:
            print(f"    ℹ️  {info}")

        for warning in result.warnings:
            print(f"    ⚠️  {warning}")

        for error in result.errors:
            print(f"    ❌ {error}")

        print()

    # Summary
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)

    passed_count = sum(1 for r in results if r.passed)
    failed_count = len(results) - passed_count

    print(f"Total tasks: {len(results)}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {failed_count}")
    print()

    if all_passed:
        print("✅ ALL TASKS VALIDATED SUCCESSFULLY")
        return 0
    else:
        print("❌ SOME TASKS FAILED VALIDATION")
        print("\nFailed tasks:")
        for result in results:
            if not result.passed:
                print(f"  - {result.name}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
