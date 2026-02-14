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
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger using __name__
logger = logging.getLogger(__name__)


class RequestNoteService:
    """Service for managing service request notes."""

    @staticmethod
    @safe_database_query("get_request_notes", default_return=([], 0))
    @log_database_operation("request notes retrieval", level="debug")
    async def get_request_notes(
        db: AsyncSession, request_id: UUID, page: int = 1, per_page: int = 50
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
        from repositories.support.request_note_repository import RequestNoteRepository

        return await RequestNoteRepository.find_by_request_id(
            db, request_id, page, per_page
        )

    @staticmethod
    @safe_database_query("get_note", default_return=None)
    @log_database_operation("note retrieval", level="debug")
    async def get_note(db: AsyncSession, note_id: int) -> RequestNote:
        """
        Get a specific note by ID.

        Args:
            db: Database session
            note_id: Note ID

        Returns:
            Note or None
        """
        from repositories.support.request_note_repository import RequestNoteRepository

        return await RequestNoteRepository.find_by_id(db, note_id)

    @staticmethod
    @safe_database_query("get_latest_notes", default_return=[])
    @log_database_operation("latest notes retrieval", level="debug")
    async def get_latest_notes(db: AsyncSession, limit: int = 10) -> List[RequestNote]:
        """
        Get the latest notes across all requests.

        Args:
            db: Database session
            limit: Number of notes to return

        Returns:
            List of latest notes
        """
        from repositories.support.request_note_repository import RequestNoteRepository

        return await RequestNoteRepository.find_latest(db, limit)

    @staticmethod
    @transactional_database_operation
    @log_database_operation("create note", level="info")
    async def create_note(
        db: AsyncSession, note_data: RequestNoteCreate, created_by: int
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
        from repositories.support.request_note_repository import RequestNoteRepository

        note_data_dict = note_data.model_dump()
        note_data_dict["created_by"] = created_by

        note = await RequestNoteRepository.create(
            db, obj_in=note_data_dict, commit=False
        )
        await db.flush()
        await db.refresh(note)

        await db.refresh(note, ["creator"])

        await db.commit()
        return note
