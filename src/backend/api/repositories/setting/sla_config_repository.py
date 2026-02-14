"""
Repository for SLAConfig database operations.
"""

from typing import Optional
from sqlmodel import select
from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from db.models import SLAConfig
from api.repositories.base_repository import BaseRepository

# mypy: disable-error-code="arg-type"
# mypy: disable-error-code="attr-defined"
# mypy: disable-error-code="call-overload"
# mypy: disable-error-code="return-value"
# mypy: disable-error-code="no-any-return"
# mypy: disable-error-code="union-attr"


class SLAConfigRepository(BaseRepository[SLAConfig]):
    model = SLAConfig

    @classmethod
    async def find_matching_config(
        cls,
        db: AsyncSession,
        category_id: int,
        priority_id: int,
        business_unit_id: Optional[int] = None,
    ) -> Optional[SLAConfig]:
        """
        Find the matching SLA config based on category, priority, and optional business unit.

        Priority order (most specific first):
        1. SLA config with matching priority + category + business_unit
        2. SLA config with matching priority + category
        3. SLA config with matching priority + business_unit
        4. SLA config with matching priority only

        Args:
            db: Database session
            category_id: Category ID
            priority_id: Priority ID
            business_unit_id: Optional business unit ID

        Returns:
            Matching SLAConfig or None if not found
        """
        configs_to_try = []

        if category_id and business_unit_id:
            configs_to_try.append(
                and_(
                    SLAConfig.priority_id == priority_id,
                    SLAConfig.category_id == category_id,
                    SLAConfig.business_unit_id == business_unit_id,
                    SLAConfig.is_active,
                )
            )

        if category_id:
            configs_to_try.append(
                and_(
                    SLAConfig.priority_id == priority_id,
                    SLAConfig.category_id == category_id,
                    SLAConfig.business_unit_id.is_(None),
                    SLAConfig.is_active,
                )
            )

        if business_unit_id:
            configs_to_try.append(
                and_(
                    SLAConfig.priority_id == priority_id,
                    SLAConfig.category_id.is_(None),
                    SLAConfig.business_unit_id == business_unit_id,
                    SLAConfig.is_active,
                )
            )

        configs_to_try.append(
            and_(
                SLAConfig.priority_id == priority_id,
                SLAConfig.category_id.is_(None),
                SLAConfig.business_unit_id.is_(None),
                SLAConfig.is_active,
            )
        )

        for condition in configs_to_try:
            stmt = (
                select(SLAConfig)
                .options(
                    selectinload(SLAConfig.priority),
                    selectinload(SLAConfig.category),
                    selectinload(SLAConfig.business_unit),
                )
                .where(condition)
            )
            result = await db.execute(stmt)
            config = result.scalar_one_or_none()
            if config:
                return config

        return None
