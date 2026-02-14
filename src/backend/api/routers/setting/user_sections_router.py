"""
User Sections API endpoints.

Manages user-section assignments via the technician_sections table.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import get_current_user, require_admin
from db import User
from api.schemas.user import UserSectionInfo, UserSectionsUpdateRequest
from api.services.setting.user_service import UserService

router = APIRouter()


@router.get("/{user_id}/sections")
async def get_user_sections(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get all sections assigned to a user."""
    sections = await UserService.get_user_sections(db=db, user_id=user_id)

    return [
        {
            "id": ts.id,
            "sectionId": ts.section_id,
            "sectionName": ts.section.name if ts.section else None,
            "assignedAt": ts.assigned_at.isoformat() if ts.assigned_at else None,
        }
        for ts in sections
    ]


@router.get("/{user_id}/sections/ids", response_model=List[int])
async def get_user_section_ids(
    user_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get all section IDs assigned to a user."""
    return await UserService.get_user_section_ids(db=db, user_id=user_id)


@router.post("/{user_id}/sections")
async def set_user_sections(
    user_id: UUID,
    request: UserSectionsUpdateRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Set all sections for a user, replacing existing assignments."""
    result = await UserService.set_user_sections(
        db=db,
        user_id=user_id,
        section_ids=request.sectionIds,
        assigned_by=current_user.id,
    )

    return [
        {
            "id": ts.id,
            "sectionId": ts.section_id,
            "sectionName": ts.section.name if ts.section else None,
            "assignedAt": ts.assigned_at.isoformat() if ts.assigned_at else None,
        }
        for ts in result
    ]


@router.delete("/{user_id}/sections/{section_id}", status_code=204)
async def remove_user_section(
    user_id: UUID,
    section_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Remove a section assignment from a user."""
    removed = await UserService.remove_user_section(
        db=db, user_id=user_id, section_id=section_id
    )
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Section {section_id} assignment not found for user {user_id}",
        )
