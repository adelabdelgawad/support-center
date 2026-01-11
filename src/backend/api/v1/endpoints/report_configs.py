"""
Report Configuration API endpoints.
"""
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user
from models.database_models import User
from schemas.report_config import (
    ReportConfigCreate,
    ReportConfigUpdate,
    ReportConfigRead,
    ReportConfigList,
)
from services.report_config_service import ReportConfigService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/report-configs", tags=["Report Configuration"])


@router.get(
    "/",
    response_model=List[ReportConfigRead],
    summary="List Report Configurations",
    description="Returns report configurations accessible to the current user.",
)
async def list_report_configs(
    include_public: bool = Query(True, description="Include public reports from other users"),
    report_type: Optional[str] = Query(None, description="Filter by report type"),
    active_only: bool = Query(True, description="Only return active configs"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List report configurations accessible to the current user."""
    configs = await ReportConfigService.list_report_configs(
        db=db,
        user_id=current_user.id,
        include_public=include_public,
        report_type=report_type,
        active_only=active_only,
    )
    return configs


@router.get(
    "/{config_id}",
    response_model=ReportConfigRead,
    summary="Get Report Configuration",
    description="Returns a specific report configuration by ID.",
)
async def get_report_config(
    config_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get a report configuration by ID."""
    config = await ReportConfigService.get_report_config(
        db=db, config_id=config_id, user_id=current_user.id
    )

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report configuration {config_id} not found or not accessible",
        )

    return config


@router.post(
    "/",
    response_model=ReportConfigRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create Report Configuration",
    description="Creates a new saved report configuration.",
)
async def create_report_config(
    config_data: ReportConfigCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new report configuration."""
    config = await ReportConfigService.create_report_config(
        db=db, config_data=config_data, created_by_id=current_user.id
    )
    return config


@router.patch(
    "/{config_id}",
    response_model=ReportConfigRead,
    summary="Update Report Configuration",
    description="Updates an existing report configuration. Only the creator can update.",
)
async def update_report_config(
    config_id: int,
    update_data: ReportConfigUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a report configuration."""
    config = await ReportConfigService.update_report_config(
        db=db, config_id=config_id, update_data=update_data, user_id=current_user.id
    )

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report configuration {config_id} not found or not owned by you",
        )

    return config


@router.delete(
    "/{config_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Report Configuration",
    description="Deactivates a report configuration. Only the creator can delete.",
)
async def delete_report_config(
    config_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete (deactivate) a report configuration."""
    success = await ReportConfigService.delete_report_config(
        db=db, config_id=config_id, user_id=current_user.id
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report configuration {config_id} not found or not owned by you",
        )
