"""CRUD operations for Email configurations."""

from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import EmailConfig
from api.repositories.base_repository import BaseRepository


class EmailConfigRepository(BaseRepository[EmailConfig]):
    """Repository for EmailConfig operations."""

    model = EmailConfig

    @classmethod
    async def get_active_config(cls, db: AsyncSession) -> Optional[EmailConfig]:
        """
        Get the currently active email configuration.

        Args:
            db: Database session

        Returns:
            Active email configuration or None if no active config exists
        """
        stmt = select(EmailConfig).where(EmailConfig.__table__.c.is_active.is_(True))
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def deactivate_all(cls, db: AsyncSession) -> None:
        """
        Deactivate all email configurations.

        Used before activating a new config to ensure only one is active.
        Caller must commit.

        Args:
            db: Database session
        """
        stmt = update(EmailConfig).values(is_active=False)
        await db.execute(stmt)
        await db.flush()

    @classmethod
    async def activate_config(
        cls, db: AsyncSession, config_id: int
    ) -> Optional[EmailConfig]:
        """
        Activate a specific email configuration and deactivate all others.

        Args:
            db: Database session
            config_id: ID of configuration to activate

        Returns:
            Activated configuration or None if not found. Caller must commit.
        """
        # First deactivate all configs
        await cls.deactivate_all(db)

        # Then activate the specified config
        config = await cls.find_by_id(db, config_id)
        if config:
            config.is_active = True
            db.add(config)
            await db.flush()
            await db.refresh(config)

        return config
