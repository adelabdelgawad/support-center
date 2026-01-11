"""
SLA Configuration API endpoints.
"""
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user, require_admin
from models.database_models import User
from schemas.sla_config import (
    SLAConfigCreate,
    SLAConfigUpdate,
    SLAConfigRead,
    SLAConfigList,
)
from services.sla_config_service import SLAConfigService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sla-configs", tags=["SLA Configuration"])


@router.get(
    "/",
    response_model=List[SLAConfigRead],
    summary="List SLA Configurations",
    description="Returns all SLA configurations with optional filters.",
)
async def list_sla_configs(
    active_only: bool = Query(True, description="Only return active configs"),
    priority_id: Optional[int] = Query(None, description="Filter by priority ID"),
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
    business_unit_id: Optional[int] = Query(None, description="Filter by business unit ID"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all SLA configurations."""
    configs = await SLAConfigService.list_sla_configs(
        db=db,
        active_only=active_only,
        priority_id=priority_id,
        category_id=category_id,
        business_unit_id=business_unit_id,
    )
    return configs


@router.get(
    "/{config_id}",
    response_model=SLAConfigRead,
    summary="Get SLA Configuration",
    description="Returns a specific SLA configuration by ID.",
)
async def get_sla_config(
    config_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get an SLA configuration by ID."""
    config = await SLAConfigService.get_sla_config(db=db, config_id=config_id)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SLA configuration {config_id} not found",
        )

    return config


@router.post(
    "/",
    response_model=SLAConfigRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create SLA Configuration",
    description="Creates a new SLA configuration. Requires admin access.",
)
async def create_sla_config(
    config_data: SLAConfigCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Create a new SLA configuration."""
    config = await SLAConfigService.create_sla_config(db=db, config_data=config_data)
    return config


@router.patch(
    "/{config_id}",
    response_model=SLAConfigRead,
    summary="Update SLA Configuration",
    description="Updates an existing SLA configuration. Requires admin access.",
)
async def update_sla_config(
    config_id: int,
    update_data: SLAConfigUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Update an SLA configuration."""
    config = await SLAConfigService.update_sla_config(
        db=db, config_id=config_id, update_data=update_data
    )

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SLA configuration {config_id} not found",
        )

    return config


@router.delete(
    "/{config_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete SLA Configuration",
    description="Deactivates an SLA configuration. Requires admin access.",
)
async def delete_sla_config(
    config_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Delete (deactivate) an SLA configuration."""
    success = await SLAConfigService.delete_sla_config(db=db, config_id=config_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"SLA configuration {config_id} not found",
        )


@router.get(
    "/effective/{priority_id}",
    summary="Get Effective SLA",
    description="Returns the effective SLA times for a given context.",
)
async def get_effective_sla(
    priority_id: int,
    category_id: Optional[int] = Query(None, description="Category ID for override lookup"),
    business_unit_id: Optional[int] = Query(None, description="Business unit ID for override lookup"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get the effective SLA times for a given priority, with optional category and business unit overrides.

    Returns the most specific SLA configuration that matches the criteria.
    """
    sla = await SLAConfigService.get_effective_sla(
        db=db,
        priority_id=priority_id,
        category_id=category_id,
        business_unit_id=business_unit_id,
    )
    return sla
