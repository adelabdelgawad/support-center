"""
Request Type repository with specialized queries.
"""

from typing import List

from db import RequestType
from repositories.base_repository import BaseRepository
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class RequestTypeRepository(BaseRepository[RequestType]):
    model = RequestType

    @classmethod
    async def find_active_with_section(
        cls,
        db: AsyncSession,
    ) -> List[RequestType]:
        """
        Find active request types with section.

        Note: This method extracts the active filter logic from the service.
        Section-related queries should be added in service layer.

        Args:
            db: Database session

        Returns:
            List of active request types
        """
        stmt = select(RequestType).order_by(RequestType.id)
        stmt = stmt.where(RequestType.is_active)

        result = await db.execute(stmt)
        request_types = result.scalars().all()

        return request_types

    @classmethod
    async def find_by_section(
        cls,
        db: AsyncSession,
        section_id: int,
    ) -> List[RequestType]:
        """
        Find request types by section ID.

        Args:
            db: Database session
            section_id: Section ID to filter by

        Returns:
            List of request types
        """
        stmt = select(RequestType).order_by(RequestType.id)
        stmt = stmt.where(RequestType.section_id == section_id)

        result = await db.execute(stmt)
        request_types = result.scalars().all()

        return request_types
