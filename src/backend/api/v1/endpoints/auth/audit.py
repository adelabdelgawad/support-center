"""
Audit API endpoints for viewing audit logs.

Provides endpoints for retrieving comprehensive audit logs of all system
actions for compliance, security monitoring, and forensic analysis.

**Access Control:**
Only accessible by super admins for security and compliance reasons.

**Key Features:**
- Paginated audit log retrieval
- Filtering by user, action, resource type, resource ID
- Correlation ID tracking for request tracing
- Before/after value tracking for change history
- IP address and user agent logging
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, get_session
from db.models import User
from api.schemas.audit import AuditFilter, AuditRead
from api.services.audit_service import AuditService

logger = logging.getLogger(__name__)

router = APIRouter()


async def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to require super admin access."""
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can access audit logs",
        )
    return current_user


@router.get("", response_model=Dict[str, Any])
async def get_audit_logs(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_super_admin),
    user_id: str | None = Query(None, description="Filter by user ID"),
    action: str | None = Query(None, description="Filter by action type"),
    resource_type: str | None = Query(None, description="Filter by resource type"),
    resource_id: str | None = Query(None, description="Filter by resource ID"),
    correlation_id: str | None = Query(None, description="Filter by correlation ID"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
):
    """
    Get audit logs with filtering and pagination.

    Returns paginated audit logs with comprehensive filtering options.
    All filter parameters are optional and can be combined.

    Args:
        request: FastAPI request object
        session: Database session
        current_user: Authenticated super admin user
        user_id: Optional filter by user who performed the action
        action: Optional filter by action type (create, update, delete, etc.)
        resource_type: Optional filter by resource type (User, ServiceRequest, etc.)
        resource_id: Optional filter by specific resource ID
        correlation_id: Optional filter by correlation ID (request tracing)
        page: Page number (1-indexed)
        per_page: Items per page (max 100)

    Returns:
        Dict with keys:
            - data: List of audit log entries
            - pagination: Page info (page, per_page, total_count, total_pages)

    Raises:
        HTTPException 403: Not a super admin
        HTTPException 500: Server error

    **Permissions:** Super admin only
    """
    try:
        # Build filter
        filters = AuditFilter(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            correlation_id=correlation_id,
            page=page,
            per_page=per_page,
        )

        # Get audit logs
        audit_logs, total_count = await AuditService.get_audit_logs(
            session=session,
            filters=filters,
        )

        # Calculate pagination
        total_pages = (total_count + per_page - 1) // per_page

        return {
            "data": audit_logs,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total_count": total_count,
                "total_pages": total_pages,
            },
        }

    except Exception as e:
        logger.error(f"Error retrieving audit logs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit logs",
        )


@router.get("/{audit_id}", response_model=AuditRead)
async def get_audit_log(
    audit_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_super_admin),
):
    """
    Get a single audit log by ID.

    Returns detailed information about a specific audit log entry,
    including before/after values for change tracking.

    Args:
        audit_id: Audit log ID
        session: Database session
        current_user: Authenticated super admin user

    Returns:
        AuditRead: Audit log details with user info

    Raises:
        HTTPException 403: Not a super admin
        HTTPException 404: Audit log not found
        HTTPException 500: Server error

    **Permissions:** Super admin only
    """
    try:
        audit_log = await AuditService.get_audit_log_by_id(
            session=session,
            audit_id=audit_id,
        )

        if not audit_log:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audit log with ID {audit_id} not found",
            )

        return audit_log

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving audit log {audit_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit log",
        )
