"""
Report Configuration service for managing saved and scheduled reports.
"""
import logging
from typing import Any, List, Optional, cast
from uuid import UUID

from sqlalchemy import ColumnElement, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db.models import ReportConfig
from api.schemas.report_config import ReportConfigCreate, ReportConfigUpdate

logger = logging.getLogger(__name__)


class ReportConfigService:
    """Service for managing report configurations."""

    @staticmethod
    @safe_database_query("list_report_configs", default_return=[])
    @log_database_operation("report config listing", level="debug")
    async def list_report_configs(
        db: AsyncSession,
        user_id: UUID,
        include_public: bool = True,
        report_type: Optional[str] = None,
        active_only: bool = True,
    ) -> List[ReportConfig]:
        """
        List report configurations accessible to a user.

        Returns configs created by the user and optionally public configs.
        """
        stmt = (
            select(ReportConfig)
            .options(selectinload(cast(Any, ReportConfig.created_by)))
            .order_by(cast(Any, ReportConfig.updated_at).desc())
        )

        # Build access filter
        access_conditions: list[ColumnElement[bool]] = [
            cast(ColumnElement[bool], ReportConfig.created_by_id == user_id)
        ]
        if include_public:
            access_conditions.append(cast(ColumnElement[bool], ReportConfig.is_public))

        stmt = stmt.where(or_(*access_conditions))

        if active_only:
            stmt = stmt.where(cast(ColumnElement[bool], ReportConfig.is_active))

        if report_type:
            stmt = stmt.where(cast(ColumnElement[bool], ReportConfig.report_type == report_type))

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    @safe_database_query("get_report_config")
    @log_database_operation("report config retrieval", level="debug")
    async def get_report_config(
        db: AsyncSession,
        config_id: int,
        user_id: UUID,
    ) -> Optional[ReportConfig]:
        """
        Get a report config by ID.

        Returns None if config doesn't exist or user doesn't have access.
        """
        stmt = (
            select(ReportConfig)
            .options(selectinload(cast(Any, ReportConfig.created_by)))
            .where(cast(ColumnElement[bool], ReportConfig.id == config_id))
        )
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return None

        # Check access
        if config.created_by_id != user_id and not config.is_public:
            return None

        return config

    @staticmethod
    @transactional_database_operation("create_report_config")
    @log_database_operation("report config creation", level="info")
    async def create_report_config(
        db: AsyncSession,
        config_data: ReportConfigCreate,
        created_by_id: UUID,
    ) -> ReportConfig:
        """Create a new report configuration."""
        config = ReportConfig(
            **config_data.model_dump(),
            created_by_id=created_by_id,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
        return config

    @staticmethod
    @transactional_database_operation("update_report_config")
    @log_database_operation("report config update", level="info")
    async def update_report_config(
        db: AsyncSession,
        config_id: int,
        update_data: ReportConfigUpdate,
        user_id: UUID,
    ) -> Optional[ReportConfig]:
        """
        Update a report configuration.

        Only the creator can update the config.
        """
        stmt = select(ReportConfig).where(
            cast(ColumnElement[bool], ReportConfig.id == config_id),
            cast(ColumnElement[bool], ReportConfig.created_by_id == user_id),
        )
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return None

        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(config, field, value)

        await db.commit()
        await db.refresh(config)
        return config

    @staticmethod
    @transactional_database_operation("delete_report_config")
    @log_database_operation("report config deletion", level="info")
    async def delete_report_config(
        db: AsyncSession,
        config_id: int,
        user_id: UUID,
    ) -> bool:
        """
        Delete a report configuration (mark as inactive).

        Only the creator can delete the config.
        """
        stmt = select(ReportConfig).where(
            cast(ColumnElement[bool], ReportConfig.id == config_id),
            cast(ColumnElement[bool], ReportConfig.created_by_id == user_id),
        )
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return False

        config.is_active = False
        await db.commit()
        return True

    @staticmethod
    @safe_database_query("list_scheduled_reports", default_return=[])
    @log_database_operation("scheduled reports listing", level="debug")
    async def list_scheduled_reports(
        db: AsyncSession,
    ) -> List[ReportConfig]:
        """
        List all active scheduled reports.

        Used by the scheduler to determine which reports to run.
        """
        stmt = (
            select(ReportConfig)
            .options(selectinload(cast(Any, ReportConfig.created_by)))
            .where(
                cast(ColumnElement[bool], ReportConfig.is_active),
                cast(ColumnElement[bool], cast(Any, ReportConfig.schedule_cron).isnot(None)),
            )
            .order_by(cast(Any, ReportConfig.id))
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    @transactional_database_operation("update_last_run")
    async def update_last_run(
        db: AsyncSession,
        config_id: int,
    ) -> bool:
        """Update the last_run_at timestamp for a scheduled report."""
        from datetime import datetime

        stmt = select(ReportConfig).where(cast(ColumnElement[bool], ReportConfig.id == config_id))
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return False

        config.last_run_at = datetime.utcnow()
        await db.commit()
        return True
