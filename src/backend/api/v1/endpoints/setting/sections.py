"""
Sections API endpoints.

Provides read-only access to service section definitions.
Service sections organize technicians into functional groups (e.g., "Hardware Support", "Network Operations").

Key Features:
- Multi-language support (shown_name_en, shown_name_ar)
- Active/inactive filtering
- Shown flag for new request form visibility
- Optional technician assignment information
- Ordered by ID for consistent display

Endpoints:
- GET / - Get all service sections with optional filtering
- GET /{section_id} - Get a specific service section by ID
- GET /{section_id}/technicians - Get technicians assigned to a section

Authentication:
- No authentication required for GET endpoints (public access)

Architecture Note:
This module has been refactored to call CRUD directly instead of using a service layer,
as the previous service was a pure passthrough with no additional business logic.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session
from crud.section_crud import SectionCRUD
from api.schemas.section import (
    SectionRead,
    SectionWithTechnicians,
    TechnicianInfo,
)

router = APIRouter()


@router.get("", response_model=List[SectionWithTechnicians])
async def get_sections(
    only_active: bool = True,
    only_shown: bool = True,
    include_technicians: bool = Query(
        False, description="Include technician assignments"
    ),
    db: AsyncSession = Depends(get_session),
):
    """
    Get all service sections.

    Args:
        only_active: If True, return only active sections (default: True)
        only_shown: If True, return only sections marked as shown in new request form (default: True)
        include_technicians: If True, include technician assignments for each section
        db: Database session

    Returns:
        List of service sections with optional technician data
    """
    try:
        sections = await SectionCRUD.find_all_active_sections(
            db,
            only_active=only_active,
            only_shown=only_shown,
            order_by_id=True,
            include_technicians=include_technicians,
        )
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching service sections: {str(e)}",
        )

    # Build response with technicians if requested
    return [
        SectionWithTechnicians(
            id=section.id,
            name=section.name,
            shown_name_en=section.shown_name_en,
            shown_name_ar=section.shown_name_ar,
            is_active=section.is_active,
            is_shown=section.is_shown,
            technicians=[
                TechnicianInfo(
                    id=str(assignment.technician.id),
                    username=assignment.technician.username,
                    full_name=assignment.technician.full_name,
                    is_active=assignment.technician.is_active,
                )
                for assignment in (section.technician_assignments or [])
                if assignment.technician
                and assignment.technician.is_active
                and not assignment.technician.is_deleted
            ]
            if include_technicians
            else [],
        )
        for section in sections
    ]


@router.get("/{section_id}", response_model=SectionRead)
async def get_section(
    section_id: int,
    db: AsyncSession = Depends(get_session),
):
    """
    Get a specific service section by ID.

    Args:
        section_id: Service section ID
        db: Database session

    Returns:
        Service section details

    Raises:
        HTTPException: 404 if section not found
    """
    try:
        section = await SectionCRUD.find_by_id_active(db, section_id)
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching service section: {str(e)}",
        )

    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service section with ID {section_id} not found",
        )

    return section


@router.get("/{section_id}/technicians")
async def get_section_technicians(
    section_id: int,
    db: AsyncSession = Depends(get_session),
):
    """
    Get all technicians assigned to a specific service section.

    Args:
        section_id: Service section ID
        db: Database session

    Returns:
        List of technicians assigned to section
    """
    try:
        technicians = await SectionCRUD.find_section_technicians(db, section_id)
    except SQLAlchemyError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while fetching technicians: {str(e)}",
        )

    return {"technicians": technicians}
