"""CRUD operations for Active Directory configurations."""
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from crud import base_crud
from db.models import ActiveDirectoryConfig


async def get_active_config(db: AsyncSession) -> Optional[ActiveDirectoryConfig]:
    """
    Get the currently active AD configuration.

    Args:
        db: Database session

    Returns:
        Active AD configuration or None if no active config exists
    """
    stmt = select(ActiveDirectoryConfig).where(ActiveDirectoryConfig.is_active)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def deactivate_all(db: AsyncSession) -> None:
    """
    Deactivate all AD configurations.

    Used before activating a new config to ensure only one is active.

    Args:
        db: Database session
    """
    stmt = update(ActiveDirectoryConfig).values(is_active=False)
    await db.execute(stmt)
    await db.commit()


async def activate_config(
    db: AsyncSession, config_id
) -> Optional[ActiveDirectoryConfig]:
    """
    Activate a specific AD configuration and deactivate all others.

    Args:
        db: Database session
        config_id: ID of configuration to activate

    Returns:
        Activated configuration or None if not found
    """
    # First deactivate all configs
    await deactivate_all(db)

    # Then activate the specified config
    config = await base_crud.find_by_id(db, ActiveDirectoryConfig, config_id)
    if config:
        config.is_active = True
        db.add(config)
        await db.commit()
        await db.refresh(config)

    return config
