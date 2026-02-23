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
        stmt = select(ClientVersion).where(ClientVersion.__table__.c.platform == platform)
        if active_only:
            stmt = stmt.where(ClientVersion.__table__.c.is_active.is_(True))
        stmt = stmt.order_by(ClientVersion.__table__.c.order_index.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_max_order_index(self, platform: str) -> int:
        result = await self.session.scalar(
            select(func.coalesce(func.max(ClientVersion.__table__.c.order_index), 0)).where(
                ClientVersion.__table__.c.platform == platform
            )
        )
        return result or 0

    async def unset_latest_for_platform(self, platform: str) -> None:
        await self.session.execute(
            update(ClientVersion)
            .where(ClientVersion.__table__.c.platform == platform)
            .where(ClientVersion.__table__.c.is_latest.is_(True))
            .values(is_latest=False)
        )
