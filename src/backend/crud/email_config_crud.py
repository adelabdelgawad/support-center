"""CRUD operations for Email configurations."""
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from crud import base_crud
from db.models import EmailConfig


async def get_active_config(db: AsyncSession) -> Optional[EmailConfig]:
    """
    Get the currently active email configuration.

    Args:
        db: Database session

    Returns:
        Active email configuration or None if no active config exists
    """
    stmt = select(EmailConfig).where(EmailConfig.is_active)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def deactivate_all(db: AsyncSession) -> None:
    """
    Deactivate all email configurations.

    Used before activating a new config to ensure only one is active.

    Args:
        db: Database session
    """
    stmt = update(EmailConfig).values(is_active=False)
    await db.execute(stmt)
    await db.commit()


async def activate_config(
    db: AsyncSession, config_id
) -> Optional[EmailConfig]:
    """
    Activate a specific email configuration and deactivate all others.

    Args:
        db: Database session
        config_id: ID of configuration to activate

    Returns:
        Activated configuration or None if not found
    """
    # First deactivate all configs
    await deactivate_all(db)

    # Then activate the specified config
    config = await base_crud.find_by_id(db, EmailConfig, config_id)
    if config:
        config.is_active = True
        db.add(config)
        await db.commit()
        await db.refresh(config)

    return config
