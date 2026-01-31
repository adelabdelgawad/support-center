"""
UserRole CRUD for database operations.

Handles all database queries related to user-role relationships.
"""
from typing import List
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import UserRole
from crud.base_repository import BaseCRUD


class UserRoleCRUD(BaseCRUD[UserRole]):
    """CRUD for UserRole database operations."""

    model = UserRole

    @classmethod
    async def find_by_user_id(
        cls,
        db: AsyncSession,
        user_id: int
    ) -> List[UserRole]:
        """
        Find all role assignments for a user.

        Args:
            db: Database session
            user_id: User UUID string

        Returns:
            List of UserRole instances
        """
        stmt = select(UserRole).where(UserRole.user_id == user_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def find_by_role_id(
        cls,
        db: AsyncSession,
        role_id: UUID
    ) -> List[UserRole]:
        """
        Find all user assignments for a role.

        Args:
            db: Database session
            role_id: Role ID

        Returns:
            List of UserRole instances
        """
        stmt = select(UserRole).where(UserRole.role_id == role_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def exists_user_role(
        cls,
        db: AsyncSession,
        user_id: str,
        role_id: UUID
    ) -> bool:
        """
        Check if a user-role assignment exists.

        Args:
            db: Database session
            user_id: User UUID string
            role_id: Role ID

        Returns:
            True if assignment exists
        """
        stmt = select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == role_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none() is not None

    @classmethod
    async def create_user_role(
        cls,
        db: AsyncSession,
        user_id: str,
        role_id: UUID,
        commit: bool = True
    ) -> UserRole:
        """
        Create a user-role assignment.

        Args:
            db: Database session
            user_id: User UUID string
            role_id: Role ID
            commit: Whether to commit immediately

        Returns:
            Created UserRole instance
        """
        user_role = UserRole(user_id=user_id, role_id=role_id)
        db.add(user_role)

        if commit:
            await db.commit()
            await db.refresh(user_role)

        return user_role

    @classmethod
    async def create_multiple_user_roles(
        cls,
        db: AsyncSession,
        user_id: str,
        role_ids: List[UUID],
        commit: bool = True
    ) -> List[UserRole]:
        """
        Create multiple user-role assignments.

        Args:
            db: Database session
            user_id: User UUID string
            role_ids: List of role IDs
            commit: Whether to commit immediately

        Returns:
            List of created UserRole instances
        """
        user_roles = [UserRole(user_id=user_id, role_id=role_id) for role_id in role_ids]
        db.add_all(user_roles)

        if commit:
            await db.commit()
            for user_role in user_roles:
                await db.refresh(user_role)

        return user_roles

    @classmethod
    async def delete_by_user_id(
        cls,
        db: AsyncSession,
        user_id: str,
        commit: bool = True
    ) -> int:
        """
        Delete all role assignments for a user.

        Args:
            db: Database session
            user_id: User UUID string
            commit: Whether to commit immediately

        Returns:
            Number of deleted assignments
        """
        stmt = delete(UserRole).where(UserRole.user_id == user_id)
        result = await db.execute(stmt)

        if commit:
            await db.commit()

        return result.rowcount

    @classmethod
    async def delete_by_user_and_role(
        cls,
        db: AsyncSession,
        user_id: str,
        role_id: UUID,
        commit: bool = True
    ) -> bool:
        """
        Delete a specific user-role assignment.

        Args:
            db: Database session
            user_id: User UUID string
            role_id: Role ID
            commit: Whether to commit immediately

        Returns:
            True if deleted, False if not found
        """
        stmt = delete(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == role_id
        )
        result = await db.execute(stmt)

        if commit:
            await db.commit()

        return result.rowcount > 0

    @classmethod
    async def replace_user_roles(
        cls,
        db: AsyncSession,
        user_id: str,
        new_role_ids: List[UUID],
        commit: bool = True
    ) -> List[UserRole]:
        """
        Replace all role assignments for a user.
        Deletes existing assignments and creates new ones.

        Args:
            db: Database session
            user_id: User UUID string
            new_role_ids: List of new role IDs
            commit: Whether to commit immediately

        Returns:
            List of new UserRole instances
        """
        # Delete existing roles
        await cls.delete_by_user_id(db, user_id, commit=False)

        # Create new roles
        user_roles = await cls.create_multiple_user_roles(
            db, user_id, new_role_ids, commit=False
        )

        if commit:
            await db.commit()
            for user_role in user_roles:
                await db.refresh(user_role)

        return user_roles
