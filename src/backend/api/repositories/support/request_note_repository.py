"""
Repository for RequestNote database operations.
"""

from typing import List, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from db import RequestNote
from api.repositories.base_repository import BaseRepository

# mypy: disable-error-code="arg-type"
# mypy: disable-error-code="attr-defined"
# mypy: disable-error-code="call-overload"
# mypy: disable-error-code="return-value"
# mypy: disable-error-code="no-any-return"
# mypy: disable-error-code="override"


class RequestNoteRepository(BaseRepository[RequestNote]):
    model = RequestNote

    @classmethod
    async def find_by_id(cls, db: AsyncSession, note_id: int) -> Optional[RequestNote]:
        """
        Find a note by ID with creator loaded.

        Args:
            db: Database session
            note_id: Note ID

        Returns:
            RequestNote or None if not found
        """
        stmt = (
            select(RequestNote)
            .options(selectinload(RequestNote.creator))
            .where(RequestNote.id == note_id)
        )

        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_request_id(
        cls,
        db: AsyncSession,
        request_id: int,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[List[RequestNote], int]:
        """
        Find notes for a service request with pagination.

        Args:
            db: Database session
            request_id: Request ID
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Tuple of (list of notes, total count)
        """
        stmt = (
            select(RequestNote)
            .options(selectinload(RequestNote.creator))
            .where(RequestNote.request_id == request_id)
        )

        count_stmt = select(RequestNote.id).where(RequestNote.request_id == request_id)

        count_result = await db.execute(count_stmt)
        total = len(count_result.all())

        stmt = (
            stmt.order_by(RequestNote.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        result = await db.execute(stmt)
        notes = result.scalars().all()

        return notes, total

    @classmethod
    async def find_latest(
        cls,
        db: AsyncSession,
        limit: int = 10,
    ) -> List[RequestNote]:
        """
        Find the latest notes across all requests.

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
                selectinload(RequestNote.request),
            )
            .order_by(RequestNote.created_at.desc())
            .limit(limit)
        )

        result = await db.execute(stmt)
        return list(result.scalars().all())
