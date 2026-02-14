"""
User CRUD for database operations.

Handles all database queries related to users.
"""

from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import Role, User, UserRole
from repositories.base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    """CRUD for User database operations."""

    model = User

    @classmethod
    async def find_by_username(
        cls, db: AsyncSession, username: str
    ) -> Optional[User]:
        """
        Find user by username.

        Args:
            db: Database session
            username: Username to search for

        Returns:
            User or None
        """
        stmt = select(User).where(User.username == username)  # type: ignore[arg-type]
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_email(
        cls, db: AsyncSession, email: str
    ) -> Optional[User]:
        """
        Find user by email.

        Args:
            db: Database session
            email: Email to search for

        Returns:
            User or None
        """
        stmt = select(User).where(User.email == email)  # type: ignore[arg-type]
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_id_with_roles(
        cls, db: AsyncSession, user_id: str  # UUID string
    ) -> Optional[User]:
        """
        Find user by UUID with roles eagerly loaded.

        Args:
            db: Database session
            user_id: User UUID string

        Returns:
            User with roles or None
        """
        stmt = (
            select(User)  # type: ignore[arg-type]
            .where(User.id == user_id)  # type: ignore[arg-type]
            .options(selectinload(User.user_roles).selectinload(UserRole.role))  # type: ignore[arg-type]
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_id_with_roles_and_business_units(
        cls, db: AsyncSession, user_id: str  # UUID string
    ) -> Optional[User]:
        """
        Find user by UUID with roles and business units eagerly loaded.

        Args:
            db: Database session
            user_id: User UUID string

        Returns:
            User with roles and business units or None
        """
        from db import TechnicianBusinessUnit

        stmt = (
            select(User)  # type: ignore[arg-type]
            .where(User.id == user_id)  # type: ignore[arg-type]
            .options(
                selectinload(User.user_roles).selectinload(UserRole.role),  # type: ignore[arg-type]
                selectinload(User.business_unit_assigns).selectinload(  # type: ignore[arg-type]
                    TechnicianBusinessUnit.business_unit  # type: ignore[arg-type]
                ),
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def find_by_id_with_pages(
        cls, db: AsyncSession, user_id: str  # UUID string
    ) -> Optional[User]:
        """
        Find user by UUID with roles and page permissions eagerly loaded.

        Args:
            db: Database session
            user_id: User UUID string

        Returns:
            User with roles and page permissions or None
        """
        from db import PageRole

        stmt = (
            select(User)  # type: ignore[arg-type]
            .where(User.id == user_id)  # type: ignore[arg-type]
            .options(
                selectinload(User.user_roles)  # type: ignore[arg-type]
                .selectinload(UserRole.role)  # type: ignore[arg-type]
                .selectinload(Role.page_permissions)  # type: ignore[arg-type]
                .selectinload(PageRole.page)  # type: ignore[arg-type]
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def list_users_paginated(
        cls,
        db: AsyncSession,
        *,
        is_technician: Optional[bool] = None,
        is_active: Optional[bool] = None,
        is_online: Optional[bool] = None,
        username: Optional[str] = None,
        page: int = 1,
        per_page: int = 50,
        eager_load_roles: bool = False,
    ) -> Tuple[List[User], int]:
        """
        List users with filtering and pagination.

        Args:
            db: Database session
            is_technician: Filter by technician status
            is_active: Filter by active status
            is_online: Filter by online status
            username: Filter by username (partial match)
            page: Page number
            per_page: Items per page
            eager_load_roles: Whether to eager load user roles

        Returns:
            Tuple of (list of users, total count)
        """
        # Build query
        stmt = select(User)
        count_stmt = select(func.count(User.id))  # type: ignore[arg-type]

        # Apply filters
        if is_technician is not None:
            stmt = stmt.where(User.is_technician == is_technician)  # type: ignore[arg-type]
            count_stmt = count_stmt.where(User.is_technician == is_technician)  # type: ignore[arg-type]

        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)  # type: ignore[arg-type]
            count_stmt = count_stmt.where(User.is_active == is_active)  # type: ignore[arg-type]

        if is_online is not None:
            stmt = stmt.where(User.is_online == is_online)  # type: ignore[arg-type]
            count_stmt = count_stmt.where(User.is_online == is_online)  # type: ignore[arg-type]

        if username:
            username_filter = User.username.ilike(f"%{username}%")  # type: ignore[attr-defined]
            stmt = stmt.where(username_filter)
            count_stmt = count_stmt.where(username_filter)

        # Get total count
        count_result = await db.execute(count_stmt)
        total = count_result.scalar()
        assert total is not None  # for mypy

        # Eager load roles if requested
        if eager_load_roles:
            stmt = stmt.options(
                selectinload(User.user_roles).selectinload(UserRole.role)  # type: ignore[arg-type]
            )

        # Apply pagination
        stmt = (
            stmt.order_by(User.username)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )

        # Execute query
        result = await db.execute(stmt)
        users = list(result.scalars().all())

        return users, total

    @classmethod
    async def list_users_with_role_counts(
        cls,
        db: AsyncSession,
        *,
        is_active: Optional[bool] = None,
        is_technician: Optional[bool] = None,
        username: Optional[str] = None,
        role_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[User], dict]:
        """
        List users with role information and counts.

        Returns two types of counts:
        1. Global User Type counts (always reflect database totals):
           - technician_count: Total technicians in database
           - user_count: Total non-technicians in database

        2. Scoped Status counts (filtered by selected User Type):
           - active_count: Active users within selected User Type
           - inactive_count: Inactive users within selected User Type
           - total: Total users matching current filters

        Args:
            db: Database session
            is_active: Filter by active status
            is_technician: Filter by technician status (User Type filter)
            username: Filter by username (partial match)
            role_id: Filter by role ID
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            Tuple of (list of users with roles loaded, counts dict)
        """
        # Build base query with eager loading
        from db import TechnicianBusinessUnit
        stmt = select(User).options(  # type: ignore[arg-type]
            selectinload(User.user_roles).selectinload(UserRole.role),  # type: ignore[arg-type]
            selectinload(User.business_unit_assigns).selectinload(  # type: ignore[arg-type]
                TechnicianBusinessUnit.business_unit  # type: ignore[arg-type]
            ),
        )

        # ============================================================
        # GLOBAL USER TYPE COUNTS (always reflect full database)
        # These never change regardless of filters
        # ============================================================
        global_counts_stmt = select(  # type: ignore[call-overload]
            func.count(User.id).label("global_total"),  # type: ignore[arg-type]
            func.count(case((User.is_technician.is_(True), 1)))  # type: ignore[attr-defined]
            .label(  # type: ignore[arg-type]
                "technician_count"
            ),
            func.count(case((User.is_technician.is_(False), 1)))  # type: ignore[attr-defined]
            .label(  # type: ignore[arg-type]
                "user_count"
            ),
        )
        global_result = await db.execute(global_counts_stmt)
        global_row = global_result.first()
        assert global_row is not None  # for mypy

        # ============================================================
        # SCOPED STATUS COUNTS (filtered by User Type only)
        # These update when User Type filter changes
        # ============================================================
        scoped_status_stmt = select(  # type: ignore[call-overload]
            func.count(User.id).label("total"),  # type: ignore[arg-type]
            func.count(case((User.is_active.is_(True), 1)))  # type: ignore[attr-defined]
            .label(  # type: ignore[arg-type]
                "active_count"
            ),
            func.count(case((User.is_active.is_(False), 1)))  # type: ignore[attr-defined]
            .label(  # type: ignore[arg-type]
                "inactive_count"
            ),
        )

        # Apply User Type filter to scoped status counts
        if is_technician is not None:
            scoped_status_stmt = scoped_status_stmt.where(
                User.is_technician == is_technician  # type: ignore[arg-type]
            )

        scoped_status_result = await db.execute(scoped_status_stmt)
        scoped_status_row = scoped_status_result.first()
        assert scoped_status_row is not None  # for mypy

        # ============================================================
        # FILTERED TOTAL (for pagination - all filters applied)
        # ============================================================
        filtered_count_stmt = select(func.count(User.id).label("filtered_total"))  # type: ignore[arg-type]

        # Apply all filters
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)  # type: ignore[arg-type]
            filtered_count_stmt = filtered_count_stmt.where(User.is_active == is_active)  # type: ignore[arg-type]

        if is_technician is not None:
            stmt = stmt.where(User.is_technician == is_technician)  # type: ignore[arg-type]
            filtered_count_stmt = filtered_count_stmt.where(
                User.is_technician == is_technician  # type: ignore[arg-type]
            )

        if username:
            username_filter = User.username.ilike(f"%{username}%")  # type: ignore[attr-defined]
            stmt = stmt.where(username_filter)
            filtered_count_stmt = filtered_count_stmt.where(username_filter)

        if role_id:
            # Join with UserRole to filter by role
            stmt = stmt.join(UserRole, User.id == UserRole.user_id).where(  # type: ignore[arg-type]
                UserRole.role_id == role_id  # type: ignore[arg-type]
            )
            filtered_count_stmt = filtered_count_stmt.join(
                UserRole, User.id == UserRole.user_id  # type: ignore[arg-type]
            ).where(UserRole.role_id == role_id)  # type: ignore[arg-type]

        filtered_result = await db.execute(filtered_count_stmt)
        filtered_total = filtered_result.scalar()
        assert filtered_total is not None  # for mypy

        # ============================================================
        # SCOPED ROLE COUNTS (filtered by User Type AND Status)
        # These update when User Type or Status filter changes
        # Returns count of users per role within current filters
        # ============================================================
        role_counts_stmt = (
            select(  # type: ignore[call-overload]
                Role.id.label("role_id"),  # type: ignore[attr-defined]
                func.count(User.id).label("user_count")  # type: ignore[arg-type]
            )
            .select_from(User)
            .join(UserRole, User.id == UserRole.user_id)  # type: ignore[arg-type]
            .join(Role, UserRole.role_id == Role.id)  # type: ignore[arg-type]
            .where(Role.is_active.is_(True))  # type: ignore[attr-defined]
            .group_by(Role.id)  # type: ignore[arg-type]
        )

        # Apply User Type filter to role counts
        if is_technician is not None:
            role_counts_stmt = role_counts_stmt.where(
                User.is_technician == is_technician  # type: ignore[arg-type]
            )

        # Apply Status filter to role counts
        if is_active is not None:
            role_counts_stmt = role_counts_stmt.where(
                User.is_active == is_active  # type: ignore[arg-type]
            )

        role_counts_result = await db.execute(role_counts_stmt)
        role_counts_rows = role_counts_result.all()

        # Convert to dict: {role_id: count}
        role_counts = {str(row.role_id): row.user_count for row in role_counts_rows}  # type: ignore[attr-defined]

        # Build counts dictionary
        counts = {
            # Filtered total (for pagination)
            "total": filtered_total,
            # Global User Type counts (always database totals)
            "global_total": global_row.global_total,
            "technician_count": global_row.technician_count,
            "user_count": global_row.user_count,
            # Scoped Status counts (within selected User Type)
            "active_count": scoped_status_row.active_count,
            "inactive_count": scoped_status_row.inactive_count,
            # Scoped Role counts (within selected User Type AND Status)
            "role_counts": role_counts,
        }

        # Apply pagination and ordering
        stmt = stmt.order_by(User.username).offset(skip).limit(limit)

        # Execute query
        result = await db.execute(stmt)
        users = list(result.scalars().unique().all())

        return users, counts

    @classmethod
    async def get_online_technicians(cls, db: AsyncSession) -> List[User]:
        """
        Get all online technician users.

        Args:
            db: Database session

        Returns:
            List of online technician users
        """
        stmt = select(User).where(  # type: ignore[arg-type]
            User.is_technician.is_(True),  # type: ignore[attr-defined]
            User.is_online.is_(True),  # type: ignore[attr-defined]
            User.is_active.is_(True),  # type: ignore[attr-defined]
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_user_counts(cls, db: AsyncSession) -> dict:
        """
        Get user counts (total, active, inactive).

        Args:
            db: Database session

        Returns:
            Dictionary with total, active_count, inactive_count
        """
        stmt = select(  # type: ignore[call-overload]
            func.count(User.id).label("total"),  # type: ignore[arg-type]
            func.count(case((User.is_active.is_(True), 1)))  # type: ignore[attr-defined]
            .label(  # type: ignore[arg-type]
                "active_count"
            ),
            func.count(case((User.is_active.is_(False), 1)))  # type: ignore[attr-defined]
            .label(  # type: ignore[arg-type]
                "inactive_count"
            ),
        )
        result = await db.execute(stmt)
        row = result.first()
        assert row is not None  # for mypy

        return {
            "total": row.total,
            "active_count": row.active_count,
            "inactive_count": row.inactive_count,
        }

    @classmethod
    async def update_online_status(
        cls,
        db: AsyncSession,
        user_id: str | UUID,
        is_online: bool,
        commit: bool = True,
    ) -> Optional[User]:
        """
        Update user's online status.

        Args:
            db: Database session
            user_id: User ID as UUID string or UUID object
            is_online: New online status
            commit: Whether to commit immediately

        Returns:
            Updated user or None if not found
        """
        # Convert string to UUID for database query
        if isinstance(user_id, str):
            user_id = UUID(user_id)

        user = await cls.find_by_id(db, user_id)
        if not user:
            return None

        user.is_online = is_online

        if commit:
            await db.commit()
            await db.refresh(user)

        return user

    @classmethod
    async def update_user_status(
        cls,
        db: AsyncSession,
        user_id: int,
        is_active: bool,
        commit: bool = True,
    ) -> Optional[User]:
        """
        Update user's active status.

        Args:
            db: Database session
            user_id: User ID
            is_active: New active status
            commit: Whether to commit immediately

        Returns:
            Updated user or None if not found
        """
        user = await cls.find_by_id(db, user_id)
        if not user:
            return None

        user.is_active = is_active

        if commit:
            await db.commit()
            await db.refresh(user)

        return user

    @classmethod
    async def update_multiple_user_status(
        cls,
        db: AsyncSession,
        user_ids: List[int],
        is_active: bool,
        commit: bool = True,
    ) -> List[User]:
        """
        Update multiple users' active status.

        Args:
            db: Database session
            user_ids: List of user IDs
            is_active: New active status
            commit: Whether to commit immediately

        Returns:
            List of updated users
        """
        stmt = select(User).where(User.id.in_(user_ids))  # type: ignore[attr-defined]
        result = await db.execute(stmt)
        users = list(result.scalars().all())

        for user in users:
            user.is_active = is_active

        if commit:
            await db.commit()
            for user in users:
                await db.refresh(user)

        return users

    @classmethod
    async def soft_delete(
        cls, db: AsyncSession, user_id: int, commit: bool = True
    ) -> bool:
        """
        Soft delete a user.

        Args:
            db: Database session
            user_id: User ID
            commit: Whether to commit immediately

        Returns:
            True if deleted, False if not found
        """
        user = await cls.find_by_id(db, user_id)
        if not user:
            return False

        user.is_deleted = True

        if commit:
            await db.commit()

        return True
