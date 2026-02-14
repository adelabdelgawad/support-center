from typing import List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from db.models import ClientVersion
from api.repositories.setting.client_version_repository import ClientVersionRepository
from api.schemas.client_version import (
    ClientVersionCreate,
    ClientVersionRead,
    ClientVersionUpdate,
)


class ClientVersionService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.version_repo = ClientVersionRepository(session)

    async def get_versions(
        self, active_only: bool = False, platform: str = "desktop"
    ) -> List[ClientVersionRead]:
        versions = await self.version_repo.find_versions(
            platform=platform, active_only=active_only
        )
        return [ClientVersionRead.model_validate(v, from_attributes=True) for v in versions]

    async def get_version(self, version_id: int) -> ClientVersionRead:
        version = await self.version_repo.get_by_id(version_id)
        if not version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client version not found")
        return ClientVersionRead.model_validate(version, from_attributes=True)

    async def create_version(self, data: ClientVersionCreate) -> ClientVersionRead:
        max_order = await self.version_repo.get_max_order_index("desktop")
        new_order = max_order + 1

        await self.version_repo.unset_latest_for_platform("desktop")

        version = ClientVersion(
            version_string=data.version_string,
            platform="desktop",
            order_index=new_order,
            is_latest=True,
            is_enforced=data.is_enforced,
            release_notes=data.release_notes,
            released_at=data.released_at,
            silent_install_args=data.silent_install_args,
        )
        self.session.add(version)
        await self.session.commit()
        await self.session.refresh(version)
        return ClientVersionRead.model_validate(version, from_attributes=True)

    async def update_version(self, version_id: int, data: ClientVersionUpdate) -> ClientVersionRead:
        version = await self.version_repo.get_by_id(version_id)
        if not version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client version not found")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(version, field, value)

        await self.session.commit()
        await self.session.refresh(version)
        return ClientVersionRead.model_validate(version, from_attributes=True)
