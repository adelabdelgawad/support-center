"""
Active Directory Configuration API endpoints.

Provides endpoints for managing Active Directory connection configurations.
These configurations control LDAP integration for user authentication and
organizational unit synchronization.

**Key Features:**
- AD configuration CRUD operations (admin only)
- Active configuration management (one active config at a time)
- Password encryption for security
- Connection testing endpoint
- OU tree browsing for configuration
- Integration with AD sync services
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session, require_admin
from api.schemas.active_directory_config import (
    ActiveDirectoryConfigCreate,
    ActiveDirectoryConfigListResponse,
    ActiveDirectoryConfigRead,
    ActiveDirectoryConfigUpdate,
    TestConnectionResponse,
)
from api.schemas.ou_tree import OUTreeNodeRead
from api.services.active_directory_config_service import ActiveDirectoryConfigService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=ActiveDirectoryConfigListResponse,
    summary="List all AD configurations",
    dependencies=[Depends(require_admin)],
)
async def list_configs(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_session),
):
    """
    List all Active Directory configurations.

    Args:
        skip: Number of records to skip (pagination offset)
        limit: Maximum number of records to return (max 100)
        db: Database session

    Returns:
        ActiveDirectoryConfigListResponse:
            - items: List of AD configurations (passwords excluded)
            - total: Total count of configurations

    **Permissions:** Admin only
    """
    configs, total = await ActiveDirectoryConfigService.get_all_configs(
        db, skip=skip, limit=min(limit, 100)
    )

    return ActiveDirectoryConfigListResponse(items=configs, total=total)


@router.get(
    "/active",
    response_model=ActiveDirectoryConfigRead,
    summary="Get active AD configuration",
    dependencies=[Depends(require_admin)],
)
async def get_active_config(
    db: AsyncSession = Depends(get_session),
):
    """
    Get the currently active Active Directory configuration.

    Only one configuration can be active at a time. This is the configuration
    used for LDAP authentication and OU synchronization.

    Args:
        db: Database session

    Returns:
        ActiveDirectoryConfigRead: Active configuration (password excluded)

    Raises:
        HTTPException 404: No active configuration found

    **Permissions:** Admin only
    """
    config = await ActiveDirectoryConfigService.get_active_config(db)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active AD configuration found",
        )

    return config


@router.get(
    "/{config_id}",
    response_model=ActiveDirectoryConfigRead,
    summary="Get AD configuration by ID",
    dependencies=[Depends(require_admin)],
)
async def get_config(
    config_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Get Active Directory configuration by ID.

    Args:
        config_id: UUID of the configuration
        db: Database session

    Returns:
        ActiveDirectoryConfigRead: Configuration details (password excluded)

    Raises:
        HTTPException 404: Configuration not found

    **Permissions:** Admin only
    """
    config = await ActiveDirectoryConfigService.get_config_by_id(db, config_id)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"AD configuration {config_id} not found",
        )

    return config


@router.post(
    "",
    response_model=ActiveDirectoryConfigRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create AD configuration",
    dependencies=[Depends(require_admin)],
)
async def create_config(
    config_data: ActiveDirectoryConfigCreate,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new Active Directory configuration.

    The password is encrypted before storage. If is_active=true, any previously
    active configuration will be deactivated.

    Args:
        config_data: AD configuration data
            - server_url: LDAP server URL (e.g., ldap://server:389)
            - domain_name: AD domain name
            - base_dn: Base distinguished name for searches
            - service_account_username: Username for authentication
            - service_account_password: Password (will be encrypted)
            - is_active: Whether to make this the active config
        db: Database session

    Returns:
        ActiveDirectoryConfigRead: Created configuration (password excluded)

    Raises:
        HTTPException 400: Validation error
        HTTPException 500: Server error

    **Permissions:** Admin only
    """
    try:
        config = await ActiveDirectoryConfigService.create_config(db, config_data)
        return config
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error creating AD configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create AD configuration",
        )


@router.put(
    "/{config_id}",
    response_model=ActiveDirectoryConfigRead,
    summary="Update AD configuration",
    dependencies=[Depends(require_admin)],
)
async def update_config(
    config_id: UUID,
    config_data: ActiveDirectoryConfigUpdate,
    db: AsyncSession = Depends(get_session),
):
    """
    Update an Active Directory configuration.

    All fields are optional. Password is encrypted if provided.
    If is_active=true, deactivates other configurations.

    Args:
        config_id: UUID of the configuration
        config_data: Fields to update
        db: Database session

    Returns:
        ActiveDirectoryConfigRead: Updated configuration (password excluded)

    Raises:
        HTTPException 400: Validation error
        HTTPException 404: Configuration not found
        HTTPException 500: Server error

    **Permissions:** Admin only
    """
    try:
        config = await ActiveDirectoryConfigService.update_config(
            db, config_id, config_data
        )

        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"AD configuration {config_id} not found",
            )

        return config
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error updating AD configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update AD configuration",
        )


@router.delete(
    "/{config_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete AD configuration",
    dependencies=[Depends(require_admin)],
)
async def delete_config(
    config_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Delete an Active Directory configuration.

    Cannot delete the active configuration. Deactivate it first.

    Args:
        config_id: UUID of the configuration
        db: Database session

    Returns:
        None (204 No Content)

    Raises:
        HTTPException 400: Trying to delete active configuration
        HTTPException 404: Configuration not found
        HTTPException 500: Server error

    **Permissions:** Admin only
    """
    try:
        deleted = await ActiveDirectoryConfigService.delete_config(db, config_id)

        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"AD configuration {config_id} not found",
            )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error deleting AD configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete AD configuration",
        )


@router.post(
    "/{config_id}/test",
    response_model=TestConnectionResponse,
    summary="Test AD connection",
    dependencies=[Depends(require_admin)],
)
async def test_connection(
    config_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Test connection to Active Directory server.

    Attempts to bind to the AD server using the configured credentials
    and performs a simple search to verify connectivity.

    Args:
        config_id: UUID of the configuration to test
        db: Database session

    Returns:
        TestConnectionResponse:
            - success: Whether connection was successful
            - message: Details about the test result
            - error: Error details if failed

    **Permissions:** Admin only
    """
    result = await ActiveDirectoryConfigService.test_connection(db, config_id)
    return result


@router.get(
    "/{config_id}/ou-tree",
    response_model=list[OUTreeNodeRead],
    summary="Get OU tree for AD configuration",
    dependencies=[Depends(require_admin)],
)
async def get_ou_tree(
    config_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Fetch organizational units as a hierarchical tree structure.

    Queries AD for all OUs and returns them as a tree structure suitable
    for display in a frontend tree view with checkboxes for selection.

    Args:
        config_id: UUID of the AD configuration
        db: Database session

    Returns:
        list[OUTreeNodeRead]: Hierarchical tree of OUs
            - ou_name: OU short name
            - ou_dn: Full distinguished name
            - exists_in_db: Whether already in database
            - children: Child OUs (recursive)

    Raises:
        HTTPException 404: Configuration not found or invalid
        HTTPException 500: Failed to fetch OU tree

    **Use Case:** Display OU tree for selection in frontend with checkboxes

    **Permissions:** Admin only
    """
    try:
        tree = await ActiveDirectoryConfigService.get_ou_tree(db, config_id)
        return tree
    except ValueError as e:
        # Config not found or invalid
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error fetching OU tree: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch OU tree: {str(e)}",
        )
