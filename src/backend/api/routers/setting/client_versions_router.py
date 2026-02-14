"""
Client Versions API endpoints.

Provides CRUD access to the client version registry for the Version Authority system.

Endpoints:
- GET / - List client versions (with optional active_only filter)
- GET /{version_id} - Get a specific client version
- POST / - Create a new client version
- PUT /{version_id} - Update a client version

Architecture:
Router -> ClientVersionService -> ClientVersionRepository -> ClientVersion model
"""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session
from api.schemas.client_version import (
    ClientVersionCreate,
    ClientVersionRead,
    ClientVersionUpdate,
)

router = APIRouter()


@router.get("", response_model=List[ClientVersionRead])
async def get_client_versions(
    active_only: bool = Query(False, description="Filter to active versions only"),
    platform: str = Query("desktop", description="Platform to filter by"),
    db: AsyncSession = Depends(get_session),
) -> List[ClientVersionRead]:
    from api.services.setting.client_version_service import ClientVersionService
    service = ClientVersionService(db)
    return await service.get_versions(active_only=active_only, platform=platform)


@router.get("/{version_id}", response_model=ClientVersionRead)
async def get_client_version(
    version_id: int,
    db: AsyncSession = Depends(get_session),
) -> ClientVersionRead:
    from api.services.setting.client_version_service import ClientVersionService
    service = ClientVersionService(db)
    return await service.get_version(version_id)


@router.post("", response_model=ClientVersionRead, status_code=201)
async def create_client_version(
    data: ClientVersionCreate,
    db: AsyncSession = Depends(get_session),
) -> ClientVersionRead:
    from api.services.setting.client_version_service import ClientVersionService
    service = ClientVersionService(db)
    return await service.create_version(data)


@router.put("/{version_id}", response_model=ClientVersionRead)
async def update_client_version(
    version_id: int,
    data: ClientVersionUpdate,
    db: AsyncSession = Depends(get_session),
) -> ClientVersionRead:
    from api.services.setting.client_version_service import ClientVersionService
    service = ClientVersionService(db)
    return await service.update_version(version_id, data)
