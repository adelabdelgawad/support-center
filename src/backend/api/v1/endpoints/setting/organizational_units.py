"""
Organizational Units API endpoints.

Provides endpoints for managing organizational units (OUs) used for
Active Directory synchronization. OUs define which organizational
units in AD should be synced into the application.

**Key Features:**
- OU CRUD operations
- AD discovery (find OUs from Active Directory)
- Enable/disable sync per OU
- Sync statistics (domain user counts)
- Integration with Active Directory LDAP
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_current_user
from db import User
from api.schemas.organizational_unit import (
    DiscoverOUsResponse,
    OrganizationalUnitCreate,
    OrganizationalUnitListResponse,
    OrganizationalUnitRead,
    OrganizationalUnitToggleRequest,
    OrganizationalUnitUpdate,
    OUSyncRequest,
    OUSyncResponse,
)
from api.services.organizational_unit_service import OrganizationalUnitService

router = APIRouter()


@router.get("", response_model=OrganizationalUnitListResponse)
async def list_organizational_units(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List all organizational units with statistics.

    Returns all OUs from the database with counts of enabled/disabled OUs
    and total domain users synced from each OU.

    Args:
        db: Database session
        current_user: Authenticated user

    Returns:
        OrganizationalUnitListResponse:
            - organizational_units: List of OUs with stats
            - total: Total OUs
            - enabled_count: Enabled OUs
            - disabled_count: Disabled OUs

    **Permissions:** Authenticated users
    """
    return await OrganizationalUnitService.get_all_ous(db)


@router.post("", response_model=OrganizationalUnitRead, status_code=status.HTTP_201_CREATED)
async def create_organizational_unit(
    ou_data: OrganizationalUnitCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new organizational unit.

    Args:
        ou_data: OU creation data
            - ou_name: Short name of the OU (e.g., 'SMH', 'EHQ')
            - ou_dn: Optional full distinguished name (auto-discovered if omitted)
            - is_enabled: Whether to include in AD sync (default: true)
            - description: Optional description
        db: Database session
        current_user: Authenticated user

    Returns:
        OrganizationalUnitRead: Created OU

    Raises:
        HTTPException 400: Validation error

    **Permissions:** Authenticated users
    """
    try:
        return await OrganizationalUnitService.create_ou(db, ou_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/sync", response_model=OUSyncResponse)
async def sync_organizational_units(
    sync_data: OUSyncRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk sync organizational units: create added OUs and delete removed OUs.

    Args:
        sync_data: Lists of OUs to add and remove
        db: Database session
        current_user: Authenticated user

    Returns:
        OUSyncResponse with created and deleted counts
    """
    result = await OrganizationalUnitService.sync_ous(
        db, sync_data.added, sync_data.removed
    )
    return OUSyncResponse(**result)


@router.get("/discover", response_model=List[DiscoverOUsResponse])
async def discover_ous_from_ad(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Discover organizational units from Active Directory.

    Fetches all OUs from AD and indicates which ones already exist in the
    database. Use this to find new OUs to add to the sync configuration.

    Args:
        db: Database session
        current_user: Authenticated user

    Returns:
        List[DiscoverOUsResponse]:
            - ou_name: OU short name
            - ou_dn: Full distinguished name
            - exists_in_db: Whether already added

    Raises:
        HTTPException 400: Invalid AD configuration
        HTTPException 401: AD authentication failed
        HTTPException 503: AD server unreachable
        HTTPException 504: AD connection timeout
        HTTPException 500: Other errors

    **Permissions:** Authenticated users
    """
    try:
        return await OrganizationalUnitService.discover_ous_from_ad(db)
    except ValueError as e:
        # Clean error for missing/invalid config
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        # Clean up verbose LDAP errors
        error_msg = str(e)

        # Check for common connection errors
        if "socket connection error" in error_msg or "Network is unreachable" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to connect to Active Directory server. Please verify the server address, port, and network connectivity in your AD configuration.",
            )
        elif "timed out" in error_msg or "timeout" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Connection to Active Directory server timed out. Please verify the server is running and accessible.",
            )
        elif "invalid credentials" in error_msg.lower() or "bind" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Active Directory authentication failed. Please verify the service account username and password.",
            )
        else:
            # Generic error - truncate if too long
            clean_error = error_msg[:200] + "..." if len(error_msg) > 200 else error_msg
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to discover OUs from AD: {clean_error}",
            )


@router.get("/{ou_id}", response_model=OrganizationalUnitRead)
async def get_organizational_unit(
    ou_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific organizational unit by ID.

    Args:
        ou_id: OU ID
        db: Database session
        current_user: Authenticated user

    Returns:
        OrganizationalUnitRead: OU details

    Raises:
        HTTPException 404: OU not found

    **Permissions:** Authenticated users
    """
    from crud.organizational_unit_crud import OrganizationalUnitCRUD

    ou = await OrganizationalUnitCRUD.get_by_id(db, ou_id)
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

    Args:
        ou_id: OU ID
        ou_data: Fields to update
            - ou_name: Optional new name
            - ou_dn: Optional new distinguished name
            - is_enabled: Optional enabled status
            - description: Optional new description
        db: Database session
        current_user: Authenticated user

    Returns:
        OrganizationalUnitRead: Updated OU

    Raises:
        HTTPException 404: OU not found

    **Permissions:** Authenticated users
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

    Removes the OU from the sync configuration. Does NOT delete domain
    users that were synced from this OU - they remain in the database.

    Args:
        ou_id: OU ID
        db: Database session
        current_user: Authenticated user

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 404: OU not found

    **Permissions:** Authenticated users
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

    Use this to quickly enable/disable an OU from AD sync without deleting it.
    Disabled OUs are skipped during sync operations.

    Args:
        ou_id: OU ID
        toggle_data: Toggle data
            - is_enabled: true to enable, false to disable
        db: Database session
        current_user: Authenticated user

    Returns:
        OrganizationalUnitRead: Updated OU

    Raises:
        HTTPException 404: OU not found

    **Permissions:** Authenticated users
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
