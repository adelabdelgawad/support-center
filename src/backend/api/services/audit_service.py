"""
Audit Service - Track user actions and system changes.

Provides comprehensive audit logging with:
- User action tracking
- Old/new value comparison
- Correlation ID integration
- IP address and endpoint tracking
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    critical_database_operation,
    log_database_operation,
    safe_database_query,
)
from db.models import Audit, User
from api.schemas.audit import AuditCreate, AuditFilter, AuditRead

logger = logging.getLogger(__name__)


class AuditService:
    """Service for managing audit logs and tracking system changes."""

    @staticmethod
    @log_database_operation("create_audit_log")
    @critical_database_operation
    async def create_audit_log(
        session: AsyncSession,
        audit_data: AuditCreate,
    ) -> Audit:
        """
        Create a new audit log entry.

        Args:
            session: Database session
            audit_data: Audit log data

        Returns:
            Created audit log entry
        """
        # Create audit log entry
        audit = Audit(**audit_data.model_dump())
        session.add(audit)
        await session.commit()
        await session.refresh(audit)

        logger.info(
            f"Audit log created: {audit.action} on {audit.resource_type} "
            f"(resource_id={audit.resource_id}, user_id={audit.user_id})"
        )

        return audit

    @staticmethod
    @log_database_operation("get_audit_logs")
    @safe_database_query
    async def get_audit_logs(
        session: AsyncSession,
        filters: AuditFilter,
    ) -> Tuple[List[AuditRead], int]:
        """
        Get audit logs with filtering and pagination.

        Args:
            session: Database session
            filters: Filter criteria

        Returns:
            Tuple of (audit logs, total count)
        """
        # Build query
        query = (
            select(
                Audit,
                User.username,
                User.full_name,
            )
            .outerjoin(User, Audit.user_id == User.id)
            .order_by(desc(Audit.created_at))
        )

        # Apply filters
        if filters.user_id:
            query = query.where(Audit.user_id == filters.user_id)
        if filters.action:
            query = query.where(Audit.action == filters.action)
        if filters.resource_type:
            query = query.where(Audit.resource_type == filters.resource_type)
        if filters.resource_id:
            query = query.where(Audit.resource_id == filters.resource_id)
        if filters.correlation_id:
            query = query.where(Audit.correlation_id == filters.correlation_id)
        if filters.start_date:
            query = query.where(Audit.created_at >= filters.start_date)
        if filters.end_date:
            query = query.where(Audit.created_at <= filters.end_date)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await session.execute(count_query)
        total_count = total_result.scalar() or 0

        # Apply pagination
        offset = (filters.page - 1) * filters.per_page
        query = query.limit(filters.per_page).offset(offset)

        # Execute query
        result = await session.execute(query)
        rows = result.all()

        # Build response
        audit_logs = []
        for audit, username, full_name in rows:
            audit_read = AuditRead(
                id=audit.id,
                user_id=audit.user_id,
                action=audit.action,
                resource_type=audit.resource_type,
                resource_id=audit.resource_id,
                old_values=audit.old_values,
                new_values=audit.new_values,
                ip_address=audit.ip_address,
                endpoint=audit.endpoint,
                correlation_id=audit.correlation_id,
                user_agent=audit.user_agent,
                changes_summary=audit.changes_summary,
                created_at=audit.created_at,
                username=username,
                user_full_name=full_name,
            )
            audit_logs.append(audit_read)

        return audit_logs, total_count

    @staticmethod
    def generate_changes_summary(old_values: Optional[Dict[str, Any]], new_values: Optional[Dict[str, Any]]) -> str:
        """
        Generate human-readable summary of changes.

        Args:
            old_values: Previous values
            new_values: New values

        Returns:
            Summary string
        """
        if not old_values and not new_values:
            return "No changes"

        if not old_values:
            # Creation
            fields = list(new_values.keys())
            return f"Created with {len(fields)} fields: {', '.join(fields[:5])}"

        if not new_values:
            # Deletion
            return "Resource deleted"

        # Update - find changed fields
        changed_fields = []
        for key in set(old_values.keys()) | set(new_values.keys()):
            old_val = old_values.get(key)
            new_val = new_values.get(key)
            if old_val != new_val:
                changed_fields.append(key)

        if not changed_fields:
            return "No changes detected"

        return f"Updated {len(changed_fields)} fields: {', '.join(changed_fields[:5])}"

    @staticmethod
    @log_database_operation("get_audit_log_by_id")
    @safe_database_query
    async def get_audit_log_by_id(
        session: AsyncSession,
        audit_id: int,
    ) -> Optional[AuditRead]:
        """
        Get a single audit log by ID.

        Args:
            session: Database session
            audit_id: Audit log ID

        Returns:
            Audit log or None if not found
        """
        query = (
            select(
                Audit,
                User.username,
                User.full_name,
            )
            .outerjoin(User, Audit.user_id == User.id)
            .where(Audit.id == audit_id)
        )

        result = await session.execute(query)
        row = result.first()

        if not row:
            return None

        audit, username, full_name = row

        return AuditRead(
            id=audit.id,
            user_id=audit.user_id,
            action=audit.action,
            resource_type=audit.resource_type,
            resource_id=audit.resource_id,
            old_values=audit.old_values,
            new_values=audit.new_values,
            ip_address=audit.ip_address,
            endpoint=audit.endpoint,
            correlation_id=audit.correlation_id,
            user_agent=audit.user_agent,
            changes_summary=audit.changes_summary,
            created_at=audit.created_at,
            username=username,
            user_full_name=full_name,
        )
