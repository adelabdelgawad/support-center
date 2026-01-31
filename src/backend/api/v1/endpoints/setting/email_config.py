"""
Email Configuration API endpoints.

Provides endpoints for managing SMTP/Email connection configurations.
These configurations control email sending for notifications and alerts.

**Key Features:**
- Email configuration CRUD operations (admin only)
- Active configuration management (one active config at a time)
- Password encryption for security
- Connection testing endpoint via test email
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session, require_admin
from api.schemas.email_config import (
    EmailConfigCreate,
    EmailConfigListResponse,
    EmailConfigRead,
    EmailConfigUpdate,
    TestEmailRequest,
    TestEmailResponse,
)
from api.services.email_config_service import EmailConfigService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=EmailConfigListResponse,
    summary="List all email configurations",
    dependencies=[Depends(require_admin)],
)
async def list_configs(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_session),
):
    """
    List all Email configurations.

    Args:
        skip: Number of records to skip (pagination offset)
        limit: Maximum number of records to return (max 100)
        db: Database session

    Returns:
        EmailConfigListResponse:
            - items: List of email configurations (passwords excluded)
            - total: Total count of configurations

    **Permissions:** Admin only
    """
    configs, total = await EmailConfigService.get_all_configs(
        db, skip=skip, limit=min(limit, 100)
    )

    return EmailConfigListResponse(items=configs, total=total)


@router.get(
    "/active",
    response_model=EmailConfigRead,
    summary="Get active email configuration",
    dependencies=[Depends(require_admin)],
)
async def get_active_config(
    db: AsyncSession = Depends(get_session),
):
    """
    Get the currently active Email configuration.

    Only one configuration can be active at a time. This is the configuration
    used for sending emails from the application.

    Args:
        db: Database session

    Returns:
        EmailConfigRead: Active configuration (password excluded)

    Raises:
        HTTPException 404: No active configuration found

    **Permissions:** Admin only
    """
    config = await EmailConfigService.get_active_config(db)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active email configuration found",
        )

    return config


@router.get(
    "/{config_id}",
    response_model=EmailConfigRead,
    summary="Get email configuration by ID",
    dependencies=[Depends(require_admin)],
)
async def get_config(
    config_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Get Email configuration by ID.

    Args:
        config_id: Configuration UUID
        db: Database session

    Returns:
        EmailConfigRead: Configuration details (password excluded)

    Raises:
        HTTPException 404: Configuration not found

    **Permissions:** Admin only
    """
    config = await EmailConfigService.get_config_by_id(db, config_id)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Email configuration with ID {config_id} not found",
        )

    return config


@router.post(
    "",
    response_model=EmailConfigRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create email configuration",
    dependencies=[Depends(require_admin)],
)
async def create_config(
    config_data: EmailConfigCreate,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new Email configuration.

    Args:
        config_data: Configuration data including SMTP details and password
        db: Database session

    Returns:
        EmailConfigRead: Created configuration (password excluded)

    Raises:
        HTTPException 400: Invalid configuration or encryption failure

    **Notes:**
    - Password is encrypted before storage using Fernet encryption
    - If is_active=True, all other configs are deactivated automatically
    - Configuration name must be unique

    **Permissions:** Admin only
    """
    try:
        config = await EmailConfigService.create_config(db, config_data)
        return config
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put(
    "/{config_id}",
    response_model=EmailConfigRead,
    summary="Update email configuration",
    dependencies=[Depends(require_admin)],
)
async def update_config(
    config_id: UUID,
    config_data: EmailConfigUpdate,
    db: AsyncSession = Depends(get_session),
):
    """
    Update an existing Email configuration.

    Args:
        config_id: Configuration UUID
        config_data: Update data (partial updates supported)
        db: Database session

    Returns:
        EmailConfigRead: Updated configuration (password excluded)

    Raises:
        HTTPException 404: Configuration not found
        HTTPException 400: Invalid update data or encryption failure

    **Notes:**
    - Password is optional - only include if changing it
    - If is_active=True, all other configs are deactivated automatically
    - Partial updates supported (only provided fields are updated)

    **Permissions:** Admin only
    """
    try:
        config = await EmailConfigService.update_config(db, config_id, config_data)

        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Email configuration with ID {config_id} not found",
            )

        return config
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete(
    "/{config_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete email configuration",
    dependencies=[Depends(require_admin)],
)
async def delete_config(
    config_id: UUID,
    db: AsyncSession = Depends(get_session),
):
    """
    Delete an Email configuration.

    Args:
        config_id: Configuration UUID
        db: Database session

    Raises:
        HTTPException 404: Configuration not found

    **Warning:** Deleting the active configuration will leave no email config active.

    **Permissions:** Admin only
    """
    deleted = await EmailConfigService.delete_config(db, config_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Email configuration with ID {config_id} not found",
        )


@router.post(
    "/{config_id}/test",
    response_model=TestEmailResponse,
    summary="Test email configuration",
    dependencies=[Depends(require_admin)],
)
async def test_connection(
    config_id: UUID,
    test_request: TestEmailRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Test email configuration by sending a test email.

    Args:
        config_id: Configuration UUID to test
        test_request: Test request with recipient email address
        db: Database session

    Returns:
        TestEmailResponse:
            - success: Whether the test email was sent successfully
            - message: Result message
            - details: Additional error details (if failed)

    **Test Process:**
    1. Retrieves and decrypts the configuration
    2. Connects to SMTP server with provided settings
    3. Sends a test email to the specified recipient
    4. Returns detailed success/failure information

    **Common Failure Reasons:**
    - Invalid SMTP credentials
    - Network connectivity issues
    - Firewall blocking SMTP ports
    - Incorrect TLS/SSL settings

    **Permissions:** Admin only
    """
    result = await EmailConfigService.test_connection(db, config_id, test_request)
    return result
