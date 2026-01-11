"""API endpoints for user custom view - ONE view per user controlling visible tabs."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user, get_session
from models.database_models import User
from schemas.user_custom_view import (
    AVAILABLE_TABS,
    AvailableTabsResponse,
    UserCustomViewRead,
    UserCustomViewUpdate,
)
from services.user_custom_view_service import UserCustomViewService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["User Custom View"])


def _model_to_read(view) -> UserCustomViewRead:
    """Convert database model to read schema."""
    return UserCustomViewRead(
        id=view.id,
        user_id=view.user_id,
        visible_tabs=view.visible_tabs,
        default_tab=view.default_tab,
        is_active=view.is_active,
        created_at=view.created_at,
        updated_at=view.updated_at,
    )


@router.get(
    "",
    response_model=UserCustomViewRead,
    summary="Get current user's custom view",
)
async def get_my_custom_view(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get the current user's custom view configuration.

    Creates a default view if it doesn't exist yet.
    Each user has exactly ONE custom view.
    """
    custom_view = await UserCustomViewService.get_or_create_user_view(
        db=db,
        user_id=current_user.id,
    )

    return _model_to_read(custom_view)


@router.put(
    "",
    response_model=UserCustomViewRead,
    summary="Update current user's custom view",
)
async def update_my_custom_view(
    data: UserCustomViewUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update the current user's custom view configuration.

    Use this to control which tabs are visible and which tab is the default.
    """
    try:
        custom_view = await UserCustomViewService.update_user_view(
            db=db,
            user_id=current_user.id,
            data=data,
        )

        return _model_to_read(custom_view)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/reset",
    response_model=UserCustomViewRead,
    summary="Reset current user's view to defaults",
)
async def reset_my_custom_view(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Reset the current user's custom view to default settings.

    This will show all default tabs with 'unassigned' as the default tab.
    """
    custom_view = await UserCustomViewService.reset_to_defaults(
        db=db,
        user_id=current_user.id,
    )

    return _model_to_read(custom_view)


@router.get(
    "/available-tabs",
    response_model=AvailableTabsResponse,
    summary="Get list of available tabs",
)
async def get_available_tabs():
    """
    Get the list of all available tab IDs that can be shown/hidden.

    Use this to populate the tab management UI.
    """
    return AvailableTabsResponse(available_tabs=AVAILABLE_TABS)
