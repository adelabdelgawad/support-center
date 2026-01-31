"""
SLA Configuration service for managing SLA rules and calculating SLA times.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db.models import SLAConfig, Priority, ServiceRequest
from api.schemas.sla_config import SLAConfigCreate, SLAConfigUpdate

logger = logging.getLogger(__name__)


class SLAConfigService:
    """Service for managing SLA configurations."""

    @staticmethod
    @safe_database_query("list_sla_configs", default_return=[])
    @log_database_operation("sla config listing", level="debug")
    async def list_sla_configs(
        db: AsyncSession,
        active_only: bool = True,
        priority_id: Optional[int] = None,
        category_id: Optional[int] = None,
        business_unit_id: Optional[int] = None,
    ) -> List[SLAConfig]:
        """List all SLA configurations with optional filters."""
        stmt = (
            select(SLAConfig)
            .options(
                selectinload(SLAConfig.priority),
                selectinload(SLAConfig.category),
                selectinload(SLAConfig.business_unit),
            )
            .order_by(SLAConfig.priority_id, SLAConfig.id)
        )

        if active_only:
            stmt = stmt.where(SLAConfig.is_active)

        if priority_id is not None:
            stmt = stmt.where(SLAConfig.priority_id == priority_id)

        if category_id is not None:
            stmt = stmt.where(SLAConfig.category_id == category_id)

        if business_unit_id is not None:
            stmt = stmt.where(SLAConfig.business_unit_id == business_unit_id)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    @safe_database_query("get_sla_config")
    @log_database_operation("sla config retrieval", level="debug")
    async def get_sla_config(
        db: AsyncSession,
        config_id: int,
    ) -> Optional[SLAConfig]:
        """Get an SLA config by ID."""
        stmt = (
            select(SLAConfig)
            .options(
                selectinload(SLAConfig.priority),
                selectinload(SLAConfig.category),
                selectinload(SLAConfig.business_unit),
            )
            .where(SLAConfig.id == config_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @transactional_database_operation("create_sla_config")
    @log_database_operation("sla config creation", level="info")
    async def create_sla_config(
        db: AsyncSession,
        config_data: SLAConfigCreate,
    ) -> SLAConfig:
        """Create a new SLA configuration."""
        config = SLAConfig(**config_data.model_dump())
        db.add(config)
        await db.commit()
        await db.refresh(config)
        return config

    @staticmethod
    @transactional_database_operation("update_sla_config")
    @log_database_operation("sla config update", level="info")
    async def update_sla_config(
        db: AsyncSession,
        config_id: int,
        update_data: SLAConfigUpdate,
    ) -> Optional[SLAConfig]:
        """Update an SLA configuration."""
        stmt = select(SLAConfig).where(SLAConfig.id == config_id)
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
    @transactional_database_operation("delete_sla_config")
    @log_database_operation("sla config deletion", level="info")
    async def delete_sla_config(
        db: AsyncSession,
        config_id: int,
    ) -> bool:
        """Delete an SLA configuration (mark as inactive)."""
        stmt = select(SLAConfig).where(SLAConfig.id == config_id)
        result = await db.execute(stmt)
        config = result.scalar_one_or_none()

        if not config:
            return False

        config.is_active = False
        await db.commit()
        return True

    @staticmethod
    @safe_database_query("get_effective_sla")
    async def get_effective_sla(
        db: AsyncSession,
        priority_id: int,
        category_id: Optional[int] = None,
        business_unit_id: Optional[int] = None,
    ) -> dict:
        """
        Get the effective SLA times for a given context.

        Priority order (most specific first):
        1. SLA config with matching priority + category + business_unit
        2. SLA config with matching priority + category
        3. SLA config with matching priority + business_unit
        4. SLA config with matching priority only
        5. Default from Priority table

        Returns:
            dict with first_response_minutes, resolution_hours, business_hours_only
        """
        # Try to find most specific SLA config first
        configs_to_try = []

        # 1. Most specific: priority + category + business_unit
        if category_id and business_unit_id:
            configs_to_try.append(
                and_(
                    SLAConfig.priority_id == priority_id,
                    SLAConfig.category_id == category_id,
                    SLAConfig.business_unit_id == business_unit_id,
                    SLAConfig.is_active,
                )
            )

        # 2. priority + category
        if category_id:
            configs_to_try.append(
                and_(
                    SLAConfig.priority_id == priority_id,
                    SLAConfig.category_id == category_id,
                    SLAConfig.business_unit_id is None,
                    SLAConfig.is_active,
                )
            )

        # 3. priority + business_unit
        if business_unit_id:
            configs_to_try.append(
                and_(
                    SLAConfig.priority_id == priority_id,
                    SLAConfig.category_id is None,
                    SLAConfig.business_unit_id == business_unit_id,
                    SLAConfig.is_active,
                )
            )

        # 4. priority only
        configs_to_try.append(
            and_(
                SLAConfig.priority_id == priority_id,
                SLAConfig.category_id is None,
                SLAConfig.business_unit_id is None,
                SLAConfig.is_active,
            )
        )

        # Try each config in order
        for condition in configs_to_try:
            stmt = select(SLAConfig).where(condition)
            result = await db.execute(stmt)
            config = result.scalar_one_or_none()
            if config:
                return {
                    "first_response_minutes": config.first_response_minutes,
                    "resolution_hours": config.resolution_hours,
                    "business_hours_only": config.business_hours_only,
                    "source": "sla_config",
                    "config_id": config.id,
                }

        # 5. Fall back to Priority table defaults
        stmt = select(Priority).where(Priority.id == priority_id)
        result = await db.execute(stmt)
        priority = result.scalar_one_or_none()

        if priority:
            return {
                "first_response_minutes": priority.response_time_minutes,
                "resolution_hours": priority.resolution_time_hours,
                "business_hours_only": True,  # Default
                "source": "priority",
                "priority_id": priority.id,
            }

        # Default fallback
        return {
            "first_response_minutes": 60,  # 1 hour
            "resolution_hours": 24,  # 24 hours
            "business_hours_only": True,
            "source": "default",
        }

    @staticmethod
    def calculate_sla_due_date(
        created_at: datetime,
        hours: int,
        business_hours_only: bool = True,
    ) -> datetime:
        """
        Calculate SLA due date considering business hours if required.

        Business hours: 9 AM - 5 PM (8 hours/day)
        Weekends (Saturday, Sunday) are excluded if business_hours_only is True.
        """
        if not business_hours_only:
            return created_at + timedelta(hours=hours)

        # Business hours calculation
        business_start_hour = 9
        business_end_hour = 17
        business_end_hour - business_start_hour  # 8 hours (for reference)

        remaining_hours = hours
        current_time = created_at

        while remaining_hours > 0:
            # Skip weekends
            while current_time.weekday() >= 5:  # Saturday = 5, Sunday = 6
                current_time = current_time.replace(
                    hour=business_start_hour, minute=0, second=0, microsecond=0
                ) + timedelta(days=1)

            # If before business hours, move to start of business hours
            if current_time.hour < business_start_hour:
                current_time = current_time.replace(
                    hour=business_start_hour, minute=0, second=0, microsecond=0
                )

            # If after business hours, move to next business day
            if current_time.hour >= business_end_hour:
                current_time = (current_time + timedelta(days=1)).replace(
                    hour=business_start_hour, minute=0, second=0, microsecond=0
                )
                continue

            # Calculate hours available today
            hours_left_today = business_end_hour - current_time.hour
            if current_time.minute > 0:
                hours_left_today -= current_time.minute / 60

            if remaining_hours <= hours_left_today:
                # Can complete within today
                current_time = current_time + timedelta(hours=remaining_hours)
                remaining_hours = 0
            else:
                # Use remaining hours today and continue to next day
                remaining_hours -= hours_left_today
                current_time = (current_time + timedelta(days=1)).replace(
                    hour=business_start_hour, minute=0, second=0, microsecond=0
                )

        return current_time

    @staticmethod
    def calculate_first_response_due(
        created_at: datetime,
        minutes: int,
        business_hours_only: bool = True,
    ) -> datetime:
        """Calculate first response SLA due date."""
        hours = minutes / 60
        return SLAConfigService.calculate_sla_due_date(
            created_at, hours, business_hours_only
        )

    @staticmethod
    async def set_sla_dates_for_request(
        db: AsyncSession,
        request: ServiceRequest,
    ) -> ServiceRequest:
        """
        Set SLA due dates for a service request based on effective SLA.

        Should be called when a request is created or when priority changes.
        """
        # Get effective SLA
        sla = await SLAConfigService.get_effective_sla(
            db=db,
            priority_id=request.priority_id,
            category_id=request.subcategory.category_id if request.subcategory else None,
            business_unit_id=request.business_unit_id,
        )

        # Calculate due dates
        request.sla_first_response_due = SLAConfigService.calculate_first_response_due(
            created_at=request.created_at,
            minutes=sla["first_response_minutes"],
            business_hours_only=sla["business_hours_only"],
        )

        request.due_date = SLAConfigService.calculate_sla_due_date(
            created_at=request.created_at,
            hours=sla["resolution_hours"],
            business_hours_only=sla["business_hours_only"],
        )

        return request

    @staticmethod
    def check_sla_breach(
        request: ServiceRequest,
        current_time: Optional[datetime] = None,
    ) -> dict:
        """
        Check if a request has breached its SLA.

        Returns dict with:
        - first_response_breached: bool
        - resolution_breached: bool
        - first_response_minutes_over: float (if breached)
        - resolution_hours_over: float (if breached)
        """
        if current_time is None:
            current_time = datetime.utcnow()

        result = {
            "first_response_breached": False,
            "resolution_breached": False,
            "first_response_minutes_over": 0.0,
            "resolution_hours_over": 0.0,
        }

        # Check first response SLA
        if request.sla_first_response_due:
            if request.first_response_at:
                # Check if first response was late
                if request.first_response_at > request.sla_first_response_due:
                    result["first_response_breached"] = True
                    delta = request.first_response_at - request.sla_first_response_due
                    result["first_response_minutes_over"] = delta.total_seconds() / 60
            elif current_time > request.sla_first_response_due:
                # No response yet and past due
                result["first_response_breached"] = True
                delta = current_time - request.sla_first_response_due
                result["first_response_minutes_over"] = delta.total_seconds() / 60

        # Check resolution SLA
        if request.due_date:
            if request.resolved_at:
                # Check if resolution was late
                if request.resolved_at > request.due_date:
                    result["resolution_breached"] = True
                    delta = request.resolved_at - request.due_date
                    result["resolution_hours_over"] = delta.total_seconds() / 3600
            elif current_time > request.due_date:
                # Not resolved yet and past due
                result["resolution_breached"] = True
                delta = current_time - request.due_date
                result["resolution_hours_over"] = delta.total_seconds() / 3600

        return result
