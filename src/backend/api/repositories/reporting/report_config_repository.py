from datetime import datetime
from typing import List, Optional, cast
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import QueryableAttribute, selectinload
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
            .options(selectinload(cast(QueryableAttribute, ReportConfig.created_by)))
            .order_by(ReportConfig.__table__.c.updated_at.desc())
        )

        access_conditions = [ReportConfig.__table__.c.created_by_id == user_id]
        if include_public:
            access_conditions.append(ReportConfig.__table__.c.is_public.is_(True))

        stmt = stmt.where(or_(*access_conditions))

        if active_only:
            stmt = stmt.where(ReportConfig.__table__.c.is_active.is_(True))

        if report_type:
            stmt = stmt.where(ReportConfig.__table__.c.report_type == report_type)

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
            .options(selectinload(cast(QueryableAttribute, ReportConfig.created_by)))
            .where(ReportConfig.__table__.c.id == config_id)
        )
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return None

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
            .options(selectinload(cast(QueryableAttribute, ReportConfig.created_by)))
            .where(
                ReportConfig.__table__.c.is_active.is_(True),
                ReportConfig.__table__.c.schedule_cron.isnot(None),
            )
            .order_by(ReportConfig.__table__.c.id)
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
        stmt = select(ReportConfig).where(ReportConfig.__table__.c.id == config_id)
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return False

        config.last_run_at = datetime.utcnow()
        await db.flush()

        return True
