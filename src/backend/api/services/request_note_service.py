"""
Request Note service with performance optimizations.
Enhanced with centralized logging and error handling.
"""
import logging
from typing import List, Tuple
from uuid import UUID

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import RequestNote
from api.schemas.request_note import RequestNoteCreate
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class RequestNoteService:
    """Service for managing service request notes."""

    @staticmethod
    @safe_database_query("get_request_notes", default_return=([], 0))
    @log_database_operation("request notes retrieval", level="debug")
    async def get_request_notes(
        db: AsyncSession,
        request_id: UUID,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[RequestNote], int]:
        """
        Get notes for a service request with pagination.

        Args:
            db: Database session
            request_id: Request ID
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (list of notes, total count)
        """
        # Build query
        stmt = (
            select(RequestNote)
            .options(
                selectinload(RequestNote.creator),
            )
            .where(RequestNote.request_id == request_id)
        )

        count_stmt = (
            select(func.count(RequestNote.id))
            .where(RequestNote.request_id == request_id)
        )

        # Get total count
        count_result = await db.execute(count_stmt)
        total = count_result.scalar()

        # Apply pagination and ordering (newest first)
        stmt = (
            stmt
            .order_by(RequestNote.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        notes = result.scalars().all()

        return notes, total

    @staticmethod
    @safe_database_query("get_note", default_return=None)
    @log_database_operation("note retrieval", level="debug")
    async def get_note(
        db: AsyncSession,
        note_id: int
    ) -> RequestNote:
        """
        Get a specific note by ID.

        Args:
            db: Database session
            note_id: Note ID

        Returns:
            Note or None
        """
        stmt = (
            select(RequestNote)
            .options(
                selectinload(RequestNote.creator),
            )
            .where(RequestNote.id == note_id)
        )

        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    @safe_database_query("get_latest_notes", default_return=[])
    @log_database_operation("latest notes retrieval", level="debug")
    async def get_latest_notes(
        db: AsyncSession,
        limit: int = 10
    ) -> List[RequestNote]:
        """
        Get the latest notes across all requests.

        Args:
            db: Database session
            limit: Number of notes to return

        Returns:
            List of latest notes
        """
        stmt = (
            select(RequestNote)
            .options(
                selectinload(RequestNote.creator),
                selectinload(RequestNote.request)
            )
            .order_by(RequestNote.created_at.desc())
            .limit(limit)
        )

        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    @transactional_database_operation
    @log_database_operation("create note", level="info")
    async def create_note(
        db: AsyncSession,
        note_data: RequestNoteCreate,
        created_by: int
    ) -> RequestNote:
        """
        Create a new service request note.

        Args:
            db: Database session
            note_data: Note creation data
            created_by: ID of user creating the note

        Returns:
            Created note
        """
        # Create note instance
        note = RequestNote(
            request_id=note_data.request_id,
            note=note_data.note,
            created_by=created_by,
            is_system_generated=note_data.is_system_generated,
        )

        db.add(note)
        await db.flush()
        await db.refresh(note)

        # Load relationships
        await db.refresh(note, ["creator"])

        return note
