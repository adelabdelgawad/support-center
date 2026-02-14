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

from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    critical_database_operation,
    log_database_operation,
    safe_database_query,
)
from db.models import Audit
from api.repositories.auth.audit_repository import AuditRepository
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
        audit = await AuditRepository.create(
            session, obj_in=audit_data.model_dump(), commit=True
        )

        logger.info(
            f"Audit log created: {audit.action} on {audit.resource_type} "
            f"(resource_id={audit.resource_id}, user_id={audit.user_id})"
        )

        return audit

    @staticmethod
    async def create_audit_log_background(audit_data: AuditCreate) -> None:
        """
        Fire-and-forget audit log creation with independent DB session.

        Args:
            audit_data: Audit log data
        """
        from db.database import AsyncSessionLocal

        try:
            async with AsyncSessionLocal() as session:
                audit = Audit(**audit_data.model_dump())
                session.add(audit)
                await session.commit()

            logger.info(
                f"Background audit log created: {audit_data.action} on {audit_data.resource_type} "
                f"(resource_id={audit_data.resource_id}, user_id={audit_data.user_id})"
            )
        except Exception as e:
            logger.error(f"Background audit log failed: {e}")

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

        filters_dict = {
            "user_id": filters.user_id,
            "action": filters.action,
            "resource_type": filters.resource_type,
            "resource_id": filters.resource_id,
            "correlation_id": filters.correlation_id,
            "search": filters.search,
            "start_date": filters.start_date,
            "end_date": filters.end_date,
        }

        audit_records, total_count = await AuditRepository.find_paginated_with_filters(
            session, filters=filters_dict, page=filters.page, per_page=filters.per_page
        )

        audit_logs = []
        for audit in audit_records:
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
                username=audit.user.username if audit.user else None,
                user_full_name=audit.user.full_name if audit.user else None,
            )
            audit_logs.append(audit_read)

        return audit_logs, total_count

    @staticmethod
    def generate_changes_summary(
        old_values: Optional[Dict[str, Any]], new_values: Optional[Dict[str, Any]]
    ) -> str:
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
            fields = list(new_values.keys())
            return f"Created with {len(fields)} fields: {', '.join(fields[:5])}"

        if not new_values:
            return "Resource deleted"

        changed_fields = []
        for key in set(old_values.keys()) | set(new_values.keys()):
            old_val = old_values.get(key)
            new_val = new_values.get(key)
            if old_val != new_val:
                changed_fields.append(key)

        if not changed_fields:
            return "No changes detected"

        summary = (
            f"Updated {len(changed_fields)} fields: {', '.join(changed_fields[:5])}"
        )
        return summary[:1000]

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
        audit = await AuditRepository.find_by_id_with_user(session, audit_id)

        if not audit:
            return None

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
            username=audit.user.username if audit.user else None,
            user_full_name=audit.user.full_name if audit.user else None,
        )

    @staticmethod
    @log_database_operation("get_distinct_actions")
    @safe_database_query
    async def get_distinct_actions(
        session: AsyncSession,
    ) -> List[str]:
        """
        Get distinct action types for filter dropdown.

        Args:
            session: Database session

        Returns:
            List of distinct action values
        """
        return await AuditRepository.find_distinct_actions(session)

    @staticmethod
    @log_database_operation("get_distinct_resource_types")
    @safe_database_query
    async def get_distinct_resource_types(
        session: AsyncSession,
    ) -> List[str]:
        """
        Get distinct resource types for filter dropdown.

        Args:
            session: Database session

        Returns:
            List of distinct resource_type values
        """
        return await AuditRepository.find_distinct_resource_types(session)

    @staticmethod
    @log_database_operation("get_distinct_users")
    @safe_database_query
    async def get_distinct_users(
        session: AsyncSession,
    ) -> List[dict]:
        """
        Get distinct users who performed actions for filter dropdown.

        Args:
            session: Database session

        Returns:
            List of dicts with user_id, username, full_name
        """
        return await AuditRepository.find_distinct_users(session)
