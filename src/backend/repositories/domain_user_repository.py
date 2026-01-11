"""
Domain User Repository for database operations.
"""

from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database_models import DomainUser
from repositories.base_repository import BaseRepository


class DomainUserRepository(BaseRepository[DomainUser]):
    """Repository for DomainUser database operations."""

    model = DomainUser

    @classmethod
    async def find_by_username(
        cls, db: AsyncSession, username: str
    ) -> Optional[DomainUser]:
        """Find domain user by username."""
        stmt = select(DomainUser).where(DomainUser.username == username)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def search_users(
        cls,
        db: AsyncSession,
        *,
        search_term: Optional[str] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> Tuple[List[DomainUser], int]:
        """
        Search domain users with pagination.

        Searches across username, email, and display_name fields.
        """
        # Build base query
        stmt = select(DomainUser)
        count_stmt = select(func.count(DomainUser.id))

        # Apply search filter
        if search_term:
            search_filter = or_(
                DomainUser.username.ilike(f"%{search_term}%"),
                DomainUser.email.ilike(f"%{search_term}%"),
                DomainUser.display_name.ilike(f"%{search_term}%"),
            )
            stmt = stmt.where(search_filter)
            count_stmt = count_stmt.where(search_filter)

        # Get total count
        count_result = await db.execute(count_stmt)
        total = count_result.scalar()

        # Apply ordering (alphabetical by display_name, then username)
        stmt = stmt.order_by(
            DomainUser.display_name.asc().nulls_last(), DomainUser.username.asc()
        )

        # Apply pagination
        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

        # Execute query
        result = await db.execute(stmt)
        items = list(result.scalars().all())

        return items, total

    @classmethod
    async def delete_all(cls, db: AsyncSession) -> int:
        """
        Delete all domain users (nuclear delete for sync).

        Returns:
            Number of deleted records
        """
        # Get count before delete
        count_result = await db.execute(select(func.count(DomainUser.id)))
        count = count_result.scalar()

        # Execute delete
        await db.execute(delete(DomainUser))

        return count

    @classmethod
    async def bulk_create(
        cls, db: AsyncSession, domain_users: List[dict], commit: bool = True
    ) -> int:
        """
        Bulk create domain users.

        Args:
            db: Database session
            domain_users: List of domain user dicts
            commit: Whether to commit immediately

        Returns:
            Number of created records
        """
        # Create DomainUser instances
        users = [DomainUser(**user_data) for user_data in domain_users]
        db.add_all(users)

        if commit:
            await db.commit()

        return len(users)
