"""
Service Sections API endpoints.

Refactored to use service layer pattern:
- Endpoint handles HTTP requests/responses
- Service handles business logic
- Repository handles database operations
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_session
from schemas.service_section import (
    ServiceSectionListItem,
    ServiceSectionRead,
    ServiceSectionWithTechnicians,
    TechnicianInfo,
)
from services.service_section_service import ServiceSectionService

router = APIRouter()


@router.get("/", response_model=List[ServiceSectionWithTechnicians])
async def get_service_sections(
    only_active: bool = True,
    only_shown: bool = True,
    include_technicians: bool = Query(False, description="Include technician assignments"),
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
    sections = await ServiceSectionService.get_service_sections(
        db,
        only_active=only_active,
        only_shown=only_shown,
        include_technicians=include_technicians
    )

    # Build response with technicians if requested
    return [
        ServiceSectionWithTechnicians(
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
                    is_active=assignment.technician.is_active
                )
                for assignment in (section.technician_assignments or [])
                if assignment.technician and assignment.technician.is_active and not assignment.technician.is_deleted
            ] if include_technicians else []
        )
        for section in sections
    ]


@router.get("/{section_id}", response_model=ServiceSectionRead)
async def get_service_section(
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
    section = await ServiceSectionService.get_service_section(db, section_id)

    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service section with ID {section_id} not found"
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
        List of technicians assigned to the section
    """
    technicians = await ServiceSectionService.get_section_technicians(db, section_id)
    return {"technicians": technicians}
