from datetime import datetime
from typing import List, Optional
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from uuid import UUID

from db.models import ReportConfig
from api.repositories.base_repository import BaseRepository


class ReportConfigRepository(BaseRepository[ReportConfig]):
    model = ReportConfig

    @classmethod
    async def find_all_accessible(
        cls,
        db: AsyncSession,
        user_id: UUID,
        include_public: bool = True,
        report_type: Optional[str] = None,
        active_only: bool = True,
    ) -> List[ReportConfig]:
        """
        List report configurations accessible to a user.

        Returns configs created by the user and optionally public configs.

        Args:
            db: Database session
            user_id: User UUID
            include_public: Include public configs
            report_type: Filter by report type
            active_only: Only return active configs

        Returns:
            List of accessible ReportConfig records
        """
        stmt = (
            select(ReportConfig)
            .options(selectinload(ReportConfig.created_by))
            .order_by(ReportConfig.updated_at.desc())
        )

        # Build access filter
        access_conditions = [ReportConfig.created_by_id == user_id]
        if include_public:
            access_conditions.append(ReportConfig.is_public)

        stmt = stmt.where(or_(*access_conditions))

        if active_only:
            stmt = stmt.where(ReportConfig.is_active)

        if report_type:
            stmt = stmt.where(ReportConfig.report_type == report_type)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_by_id_with_access_check(
        cls,
        db: AsyncSession,
        config_id: int,
        user_id: UUID,
    ) -> Optional[ReportConfig]:
        """
        Get a report config by ID with access check.

        Returns None if config doesn't exist or user doesn't have access.

        Args:
            db: Database session
            config_id: Config ID
            user_id: User UUID

        Returns:
            ReportConfig or None if not found or no access
        """
        stmt = (
            select(ReportConfig)
            .options(selectinload(ReportConfig.created_by))
            .where(ReportConfig.id == config_id)
        )
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return None

        # Check access
        if config.created_by_id != user_id and not config.is_public:
            return None

        return config

    @classmethod
    async def find_scheduled_reports(
        cls,
        db: AsyncSession,
    ) -> List[ReportConfig]:
        """
        List all active scheduled reports.

        Used by the scheduler to determine which reports to run.

        Args:
            db: Database session

        Returns:
            List of scheduled ReportConfig records
        """
        stmt = (
            select(ReportConfig)
            .options(selectinload(ReportConfig.created_by))
            .where(
                ReportConfig.is_active,
                ReportConfig.schedule_cron is not None,
            )
            .order_by(ReportConfig.id)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def update_last_run(
        cls,
        db: AsyncSession,
        config_id: int,
    ) -> bool:
        """
        Update the last_run_at timestamp for a scheduled report.

        Args:
            db: Database session
            config_id: Config ID

        Returns:
            True if updated, False if not found
        """
        stmt = select(ReportConfig).where(ReportConfig.id == config_id)
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return False

        config.last_run_at = datetime.utcnow()
        await db.flush()

        return True
