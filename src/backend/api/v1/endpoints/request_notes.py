"""
Request Note API endpoints.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import get_current_user, require_technician
from models.database_models import User
from schemas.request_note import (
    RequestNoteCreate,
    RequestNoteDetail,
    RequestNoteRead,
)
from services.request_note_service import RequestNoteService

router = APIRouter()


@router.get("/{request_id}/notes", response_model=List[RequestNoteRead])
async def get_request_notes(
    request_id: UUID,
    response: Response,
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_session),
):
    """
    Get all notes for a service request.

    Notes track status changes and other important events in the request lifecycle.

    - **request_id**: Service request ID
    - **page**: Page number (default: 1)
    - **per_page**: Items per page (default: 50, max: 100)
    """
    notes, total = await RequestNoteService.get_request_notes(
        db=db, request_id=request_id, page=page, per_page=per_page
    )

    # Add pagination info to response headers
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Per-Page"] = str(per_page)

    return notes


@router.get("/notes/{note_id}", response_model=RequestNoteDetail)
async def get_note(note_id: int, db: AsyncSession = Depends(get_session)):
    """
    Get a specific note by ID with detailed information.

    Returns the note with creator information and status details.
    """
    note = await RequestNoteService.get_note(db=db, note_id=note_id)

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    return note


@router.post("/", response_model=RequestNoteRead, status_code=201)
async def create_note(
    note_data: RequestNoteCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new note for a service request.

    Notes can be used for tracking, hints, or general comments without requiring
    status changes.

    - **request_id**: Service request UUID
    - **note**: Note content (1-2000 characters)
    - **is_system_generated**: Whether this note was auto-generated (default: false)

    Returns the created note with creator information.
    """
    try:
        note = await RequestNoteService.create_note(
            db=db, note_data=note_data, created_by=current_user.id
        )
        return note
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/notes/latest", response_model=List[RequestNoteDetail])
async def get_latest_notes(
    limit: int = Query(
        10, ge=1, le=50, description="Number of notes to return"
    ),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_technician),
):
    """
    Get the latest notes across all service requests.

    Useful for dashboards and activity feeds.

    - **limit**: Number of notes to return (default: 10, max: 50)
    """
    notes = await RequestNoteService.get_latest_notes(db=db, limit=limit)
    return notes
