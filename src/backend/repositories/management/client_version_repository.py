from typing import Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import ClientVersion
from repositories.base_repository import BaseRepository


class ClientVersionRepository(BaseRepository[ClientVersion]):
    model = ClientVersion

    @classmethod
    async def find_latest(
        cls,
        db: AsyncSession,
        platform: str = "desktop",
    ) -> Optional[ClientVersion]:
        """
        Get the latest version for a platform.

        Args:
            db: Database session
            platform: Platform to get latest for

        Returns:
            ClientVersion marked as latest, or None if none set
        """
        stmt = (
            select(ClientVersion)
            .where(ClientVersion.platform == platform)
            .where(ClientVersion.is_active)
            .where(ClientVersion.is_latest)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_version(
        cls,
        db: AsyncSession,
        version: str,
        platform: str = "desktop",
    ) -> Optional[ClientVersion]:
        """
        Get a client version by version string and platform.

        Args:
            db: Database session
            version: Version string to look up
            platform: Platform to filter by

        Returns:
            ClientVersion or None if not found
        """
        stmt = (
            select(ClientVersion)
            .where(ClientVersion.version_string == version)
            .where(ClientVersion.platform == platform)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def unset_latest_for_platform(
        cls,
        db: AsyncSession,
        platform: str,
    ) -> None:
        """
        Unset is_latest for all versions of a platform.

        Args:
            db: Database session
            platform: Platform to unset latest for
        """
        from sqlalchemy import update

        stmt = (
            update(ClientVersion)
            .where(ClientVersion.platform == platform)
            .where(ClientVersion.is_latest)
            .values(is_latest=False)
        )
        await db.execute(stmt)
