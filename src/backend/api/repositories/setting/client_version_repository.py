"""
Client Version repository for database operations.

Handles all database queries related to client versions.
"""

from typing import List, Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import ClientVersion
from api.repositories.base_repository import BaseRepository


class ClientVersionRepository(BaseRepository[ClientVersion]):
    """Repository for ClientVersion database operations."""

    model = ClientVersion

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, version_id: int) -> Optional[ClientVersion]:
        return await self.session.get(ClientVersion, version_id)

    async def find_versions(
        self, platform: str = "desktop", active_only: bool = False
    ) -> List[ClientVersion]:
        stmt = select(ClientVersion).where(ClientVersion.platform == platform)
        if active_only:
            stmt = stmt.where(ClientVersion.is_active == True)
        stmt = stmt.order_by(ClientVersion.order_index.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_max_order_index(self, platform: str) -> int:
        result = await self.session.scalar(
            select(func.coalesce(func.max(ClientVersion.order_index), 0)).where(
                ClientVersion.platform == platform
            )
        )
        return result or 0

    async def unset_latest_for_platform(self, platform: str) -> None:
        await self.session.execute(
            update(ClientVersion)
            .where(ClientVersion.platform == platform)
            .where(ClientVersion.is_latest == True)
            .values(is_latest=False)
        )
