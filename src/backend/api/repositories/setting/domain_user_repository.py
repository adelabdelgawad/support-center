"""
Domain User CRUD for database operations.
"""

from typing import List, Optional, Tuple

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import DomainUser
from api.repositories.base_repository import BaseRepository


class DomainUserRepository(BaseRepository[DomainUser]):
    """Repository for DomainUser operations."""

    model = DomainUser

    @classmethod
    async def find_by_username(
        cls, db: AsyncSession, username: str
    ) -> Optional[DomainUser]:
        """Find domain user by username."""
        stmt = select(DomainUser).where(DomainUser.__table__.c.username == username)
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
        stmt = select(DomainUser)
        count_stmt = select(func.count())

        if search_term:
            search_filter = or_(
                DomainUser.__table__.c.username.ilike(f"%{search_term}%"),
                DomainUser.__table__.c.email.ilike(f"%{search_term}%"),
                DomainUser.__table__.c.display_name.ilike(f"%{search_term}%"),
            )
            stmt = stmt.where(search_filter)
            count_stmt = count_stmt.where(search_filter)

        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        stmt = stmt.order_by(
            DomainUser.__table__.c.display_name.asc(), DomainUser.__table__.c.username.asc()
        )

        offset = (page - 1) * per_page
        stmt = stmt.offset(offset).limit(per_page)

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
        count_result = await db.execute(select(func.count()).select_from(DomainUser))
        count = count_result.scalar() or 0

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
            commit: Whether to flush immediately

        Returns:
            Number of created records
        """
        users = [DomainUser(**user_data) for user_data in domain_users]
        db.add_all(users)

        if commit:
            await db.flush()

        return len(users)
