"""
Domain Users API endpoints.
Provides AD user synchronization and search.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from celery_app import celery_app
from core.database import get_session
from core.dependencies import get_current_user
from models import User
from schemas.user.domain_user import (
    DomainUserListResponse,
    DomainUserSyncResponse,
    DomainUserSyncTaskResponse,
)
from services.domain_user_service import DomainUserService
from tasks.ad_sync_tasks import sync_domain_users_task

router = APIRouter()


@router.get("/", response_model=DomainUserListResponse)
async def list_domain_users(
    response: Response,
    search: Optional[str] = Query(
        None, description="Search term for username, email, or display name"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List domain users with pagination and search.

    - **search**: Search across username, email, and display_name
    - **page**: Page number (1-indexed)
    - **per_page**: Items per page (max 100)

    Requires authentication.
    """
    items, total = await DomainUserService.get_paginated_users(
        db, search=search, page=page, per_page=per_page
    )

    # Set total count header
    response.headers["X-Total-Count"] = str(total)

    return DomainUserListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/sync", response_model=DomainUserSyncTaskResponse)
async def sync_domain_users(
    current_user: User = Depends(get_current_user),
):
    """
    Manually trigger domain user synchronization from Active Directory.

    Requires authentication.

    This endpoint dispatches a background Celery task that:
    1. Fetches all enabled users from configured AD OUs
    2. Deletes all existing domain_users records (nuclear replace)
    3. Bulk inserts new records from AD

    Returns task_id for tracking the sync progress.
    """
    # Dispatch the Celery task
    task = sync_domain_users_task.delay()

    return DomainUserSyncTaskResponse(
        task_id=task.id,
        status="pending",
        message="AD sync task dispatched. Use /sync/status/{task_id} to check progress.",
    )


@router.get("/sync/status/{task_id}", response_model=DomainUserSyncResponse)
async def get_sync_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Get the status of an AD sync task.

    Requires authentication.

    Returns the current status and result of the sync task.
    """
    from datetime import datetime

    task_result = celery_app.AsyncResult(task_id)

    if task_result.state == "PENDING":
        return DomainUserSyncResponse(
            success=False,
            message="Task is pending or does not exist",
            synced_count=0,
            sync_timestamp=datetime.utcnow(),
        )
    elif task_result.state == "STARTED":
        return DomainUserSyncResponse(
            success=False,
            message="Task is currently running",
            synced_count=0,
            sync_timestamp=datetime.utcnow(),
        )
    elif task_result.state == "SUCCESS":
        result = task_result.result
        return DomainUserSyncResponse(
            success=result.get("success", False),
            message=result.get("message", "Task completed"),
            synced_count=result.get("synced_count", 0),
            sync_timestamp=datetime.fromisoformat(result.get("sync_timestamp", datetime.utcnow().isoformat())),
        )
    elif task_result.state == "FAILURE":
        return DomainUserSyncResponse(
            success=False,
            message=f"Task failed: {str(task_result.info)}",
            synced_count=0,
            sync_timestamp=datetime.utcnow(),
        )
    else:
        return DomainUserSyncResponse(
            success=False,
            message=f"Task state: {task_result.state}",
            synced_count=0,
            sync_timestamp=datetime.utcnow(),
        )
