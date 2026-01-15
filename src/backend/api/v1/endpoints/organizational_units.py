"""
Organizational Units API endpoints.
Provides OU management for AD synchronization control.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user
from models import User
from schemas.organizational_unit import (
    DiscoverOUsResponse,
    OrganizationalUnitCreate,
    OrganizationalUnitListResponse,
    OrganizationalUnitRead,
    OrganizationalUnitToggleRequest,
    OrganizationalUnitUpdate,
)
from services.organizational_unit_service import OrganizationalUnitService

router = APIRouter()


@router.get("/", response_model=OrganizationalUnitListResponse)
async def list_organizational_units(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List all organizational units with statistics.

    Returns all OUs from the database with enabled/disabled counts.
    Requires authentication.
    """
    return await OrganizationalUnitService.get_all_ous(db)


@router.post("/", response_model=OrganizationalUnitRead, status_code=status.HTTP_201_CREATED)
async def create_organizational_unit(
    ou_data: OrganizationalUnitCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new organizational unit.

    - **ou_name**: Short name of the OU (e.g., 'SMH', 'EHQ')
    - **ou_dn**: Optional full distinguished name
    - **is_enabled**: Whether to include in AD sync (default: true)
    - **description**: Optional description

    Requires authentication.
    """
    try:
        return await OrganizationalUnitService.create_ou(db, ou_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/discover", response_model=List[DiscoverOUsResponse])
async def discover_ous_from_ad(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Discover organizational units from Active Directory.

    Fetches all OUs from AD and indicates which ones already exist in the database.
    Use this to find new OUs to add to the sync configuration.

    Requires authentication.
    """
    try:
        return await OrganizationalUnitService.discover_ous_from_ad(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to discover OUs from AD: {str(e)}",
        )


@router.get("/{ou_id}", response_model=OrganizationalUnitRead)
async def get_organizational_unit(
    ou_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific organizational unit by ID.

    Requires authentication.
    """
    from repositories.organizational_unit_repository import OrganizationalUnitRepository

    ou = await OrganizationalUnitRepository.get_by_id(db, ou_id)
    if not ou:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OU with ID {ou_id} not found",
        )

    return OrganizationalUnitRead.model_validate(ou)


@router.patch("/{ou_id}", response_model=OrganizationalUnitRead)
async def update_organizational_unit(
    ou_id: int,
    ou_data: OrganizationalUnitUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update an organizational unit.

    All fields are optional. Only provided fields will be updated.

    Requires authentication.
    """
    try:
        return await OrganizationalUnitService.update_ou(db, ou_id, ou_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{ou_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organizational_unit(
    ou_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an organizational unit.

    This removes the OU from the sync configuration.
    It does not delete domain users that were synced from this OU.

    Requires authentication.
    """
    deleted = await OrganizationalUnitService.delete_ou(db, ou_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OU with ID {ou_id} not found",
        )


@router.post("/{ou_id}/toggle", response_model=OrganizationalUnitRead)
async def toggle_ou_enabled(
    ou_id: int,
    toggle_data: OrganizationalUnitToggleRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle organizational unit enabled status.

    Use this to enable/disable an OU from AD sync without deleting it.

    - **is_enabled**: true to enable, false to disable

    Requires authentication.
    """
    try:
        return await OrganizationalUnitService.toggle_ou_enabled(
            db, ou_id, toggle_data.is_enabled
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
