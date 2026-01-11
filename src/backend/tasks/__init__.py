"""
Celery tasks package.

This package contains all background task modules organized by function.
Each module is assigned to a dedicated queue for workload isolation.

Queues:
- file_queue: File processing, MinIO uploads (medium priority)
- email_queue: Email notification tasks (high priority)

Note: Task modules are auto-discovered by Celery from celery_app.autodiscover_tasks()
Do NOT import task modules here to avoid circular imports.
"""

__all__ = []
