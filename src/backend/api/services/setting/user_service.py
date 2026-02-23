"""
User service with performance optimizations.
Enhanced with centralized logging and error handling.

REFACTORED:
- Replaced UserRole enum with is_technician boolean field
- Renamed get_online_agents to get_online_technicians
- Migrated database operations to UserRepository (repository pattern)
- Moved complex business logic from endpoints to service layer
"""

import logging
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.decorators import (
    log_database_operation,
    safe_database_query,
    transactional_database_operation,
)
from db import User, UserRole, Page, PageRole, TechnicianSection
from api.repositories.setting.user_repository import UserRepository
from api.repositories.setting.user_role_repository import UserRoleRepository
from api.schemas.user import (
    UserCreate,
    UserListItem,
    UserUpdate,
    UserWithRolesListItem,
    UserRoleInfo,
    UserBusinessUnitInfo,
    UserSectionInfo,
)

# Module-level logger using __name__
logger = logging.getLogger(__name__)

# mypy: disable-error-code="arg-type"
# mypy: disable-error-code="attr-defined"
# mypy: disable-error-code="call-overload"
# mypy: disable-error-code="return-value"
# mypy: disable-error-code="no-any-return"
# mypy: disable-error-code="assignment"
# mypy: disable-error-code="union-attr"


class UserService:
    """Service for managing users with performance optimizations."""

    @staticmethod
    @transactional_database_operation("create_user")
    @log_database_operation("user creation", level="debug")
    async def create_user(db: AsyncSession, user_data: UserCreate) -> User:
        """
        Create a new user.

        Args:
            db: Database session
            user_data: User creation data

        Returns:
            Created user
        """
        # Business logic: validate unique constraints could go here
        # For now, delegate to repository
        user = await UserRepository.create(db, obj_in=user_data.model_dump(), commit=True)
        return user

    @staticmethod
    @safe_database_query("get_user")
    @log_database_operation("user retrieval", level="debug")
    async def get_user(db: AsyncSession, user_id: int) -> Optional[User]:
        """
        Get a user by ID with caching.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            User or None
        """
        return await UserRepository.find_by_id(db, user_id)

    @staticmethod
    @safe_database_query("get_user_by_username")
    @log_database_operation("user lookup by username", level="debug")
    async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
        """
        Get a user by username.

        Args:
            db: Database session
            username: Username

        Returns:
            User or None
        """
        return await UserRepository.find_by_username(db, username)

    @staticmethod
    @safe_database_query("get_user_by_email")
    @log_database_operation("user lookup by email", level="debug")
    async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
        """
        Get a user by email.

        Args:
            db: Database session
            email: Email address

        Returns:
            User or None
        """
        return await UserRepository.find_by_email(db, email)

    @staticmethod
    @safe_database_query("list_users", default_return=([], 0))
    @log_database_operation("user listing", level="debug")
    async def list_users(
        db: AsyncSession,
        is_technician: Optional[bool] = None,
        is_active: Optional[bool] = None,
        is_online: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[List[UserListItem], int]:
        """
        List users with filtering and pagination.

        Args:
            db: Database session
            is_technician: Filter by technician status
            is_active: Filter by active status
            is_online: Filter by online status
            page: Page number
            per_page: Items per page

        Returns:
            Tuple of (list of users, total count)
        """
        # Delegate to repository
        users, total = await UserRepository.list_users_paginated(
            db,
            is_technician=is_technician,
            is_active=is_active,
            is_online=is_online,
            page=page,
            per_page=per_page,
        )

        # Convert to list items (business logic: data transformation)
        items = [UserListItem.model_validate(user) for user in users]

        return items, total

    @staticmethod
    @transactional_database_operation("update_user")
    @log_database_operation("user update", level="debug")
    async def update_user(
        db: AsyncSession, user_id: int, update_data: UserUpdate
    ) -> Optional[User]:
        """
        Update a user.

        Args:
            db: Database session
            user_id: User ID
            update_data: Update data

        Returns:
            Updated user or None
        """
        # Business logic: add updated_at timestamp
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.utcnow()

        # Delegate to repository
        return await UserRepository.update(
            db, id_value=user_id, obj_in=update_dict, commit=True
        )

    @staticmethod
    @transactional_database_operation("update_online_status")
    @log_database_operation("online status update", level="debug")
    async def update_online_status(
        db: AsyncSession, user_id: str | UUID, is_online: bool
    ) -> Optional[User]:
        """
        Update user online status.

        Args:
            db: Database session
            user_id: User ID as UUID string or UUID object
            is_online: Online status

        Returns:
            Updated user or None
        """
        # Convert to string for consistency (repository will convert to UUID)
        user_id_str = str(user_id) if isinstance(user_id, UUID) else user_id

        # Business logic: update last_seen when status changes
        user = await UserRepository.update_online_status(
            db, user_id_str, is_online, commit=False
        )

        if user:
            user.last_seen = datetime.utcnow()
            await db.commit()
            await db.refresh(user)

        return user

    @staticmethod
    @transactional_database_operation("delete_user")
    @log_database_operation("user deletion", level="debug")
    async def delete_user(db: AsyncSession, user_id: int) -> bool:
        """
        Soft delete a user by marking them as deleted.
        Sets is_deleted = True instead of permanently deleting the record.
        This preserves data integrity and allows for recovery if needed.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            True if deleted, False if not found
        """
        return await UserRepository.soft_delete(db, user_id, commit=True)

    @staticmethod
    @safe_database_query("get_online_technicians", default_return=[])
    @log_database_operation("online technicians retrieval", level="debug")
    async def get_online_technicians(db: AsyncSession) -> List[UserListItem]:
        """
        Get all online technicians (including supervisors).

        Args:
            db: Database session

        Returns:
            List of online technicians
        """
        users = await UserRepository.get_online_technicians(db)

        # Convert to list items (business logic: data transformation)
        items = [UserListItem.model_validate(user) for user in users]

        return items

    @staticmethod
    @safe_database_query("list_users_with_role_counts", default_return=([], {}))
    @log_database_operation("users with role counts retrieval", level="debug")
    async def list_users_with_role_counts(
        db: AsyncSession,
        is_active: Optional[bool] = None,
        is_technician: Optional[bool] = None,
        username: Optional[str] = None,
        role_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[UserWithRolesListItem], dict]:
        """
        List users with their role information and counts.

        Args:
            db: Database session
            is_active: Filter by active status
            is_technician: Filter by technician status (User Type filter)
            username: Filter by username (partial match)
            role_id: Filter by role ID
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            Tuple of (list of users with roles, counts dict)
        """
        # Use repository to get users with roles and counts
        users, counts = await UserRepository.list_users_with_role_counts(
            db,
            is_active=is_active,
            is_technician=is_technician,
            username=username,
            role_id=role_id,
            skip=skip,
            limit=limit,
        )

        # Build response with roles and business units
        user_items = []
        for user in users:
            roles = [
                UserRoleInfo(id=ur.role.id, name=ur.role.name)
                for ur in user.user_roles
                if ur.role
            ]
            role_ids = [ur.role_id for ur in user.user_roles]

            # Get active business units for user
            business_units = [
                UserBusinessUnitInfo(
                    id=bu_assign.business_unit.id,
                    name=bu_assign.business_unit.name,
                    is_active=bu_assign.business_unit.is_active,
                )
                for bu_assign in user.business_unit_assigns
                if bu_assign.business_unit
                and not bu_assign.is_deleted
                and bu_assign.is_active
            ]

            # Get active sections for user
            sections = [
                UserSectionInfo(
                    id=ts.id,
                    sectionId=ts.section_id,
                    sectionName=ts.section.name if ts.section else None,
                    assignedAt=ts.assigned_at,
                    isActive=ts.section.is_active if ts.section else True,
                )
                for ts in user.section_assigns
                if ts.section
            ]

            user_items.append(
                UserWithRolesListItem(
                    id=user.id,
                    username=user.username,
                    full_name=user.full_name,
                    email=user.email,
                    title=user.title,
                    is_technician=user.is_technician,
                    is_online=user.is_online,
                    is_active=user.is_active,
                    is_super_admin=user.is_super_admin,
                    is_domain=user.is_domain,
                    is_blocked=user.is_blocked,
                    block_message=user.block_message,
                    manager_id=user.manager_id,
                    roles=roles,
                    role_ids=role_ids,
                    business_units=business_units,
                    sections=sections,
                )
            )

        return user_items, counts

    @staticmethod
    @safe_database_query("get_user_counts", default_return={})
    @log_database_operation("user counts retrieval", level="debug")
    async def get_user_counts(db: AsyncSession) -> dict:
        """
        Get user count statistics.

        Args:
            db: Database session

        Returns:
            Dictionary with total, active_count, inactive_count
        """
        return await UserRepository.get_user_counts(db)

    @staticmethod
    @safe_database_query("get_user_roles", default_return=[])
    @log_database_operation("user roles retrieval", level="debug")
    async def get_user_roles(db: AsyncSession, user_id: UUID) -> List[UserRoleInfo]:
        """
        Get roles assigned to a user.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            List of UserRoleInfo

        Raises:
            None - Returns empty list if user not found
        """
        user = await UserRepository.find_by_id_with_roles(db, str(user_id))
        if not user:
            return []

        return [
            UserRoleInfo(id=ur.role.id, name=ur.role.name)
            for ur in user.user_roles
            if ur.role
        ]

    @staticmethod
    @transactional_database_operation("update_user_roles")
    @log_database_operation("user roles update", level="debug")
    async def update_user_roles(
        db: AsyncSession,
        user_id: UUID,
        original_role_ids: List[UUID],
        updated_role_ids: List[UUID],
    ) -> dict:
        """
        Update roles assigned to a user.

        Calculates differences between original and updated role lists,
        then adds/removes roles accordingly.

        Args:
            db: Database session
            user_id: User ID to update
            original_role_ids: Original role ID list
            updated_role_ids: Updated role ID list

        Returns:
            Dictionary with added and removed counts and message

        Raises:
            ValueError: If user not found or role not found
        """
        # Calculate differences
        original_set = set(original_role_ids)
        updated_set = set(updated_role_ids)

        roles_to_add = list(updated_set - original_set)
        roles_to_remove = list(original_set - updated_set)

        added_count = 0
        removed_count = 0

        # Add new roles
        if roles_to_add:
            # Verify all roles exist
            from api.services.setting.role_service import RoleService

            for role_id in roles_to_add:
                role = await RoleService.get_role(db=db, role_id=role_id)
                if not role:
                    raise ValueError(f"Role {role_id} not found")

            # Commit during the last operation if we're only adding
            should_commit = not roles_to_remove
            await UserRoleRepository.create_multiple_user_roles(
                db, str(user_id), roles_to_add, commit=should_commit
            )
            added_count = len(roles_to_add)

        # Remove old roles
        if roles_to_remove:
            for i, role_id in enumerate(roles_to_remove):
                # Commit on the last deletion
                should_commit = i == len(roles_to_remove) - 1
                await UserRoleRepository.delete_by_user_and_role(
                    db, str(user_id), role_id, commit=should_commit
                )
            removed_count = len(roles_to_remove)

        return {
            "message": "User roles updated successfully",
            "added": added_count,
            "removed": removed_count,
        }

    @staticmethod
    @transactional_database_operation("update_user_with_enrichment")
    @log_database_operation("user update with enrichment", level="debug")
    async def update_user_with_enrichment(
        db: AsyncSession, user_id: UUID, update_data: UserUpdate
    ) -> Optional[UserWithRolesListItem]:
        """
        Update a user and return enriched data with roles and business units.

        Args:
            db: Database session
            user_id: User ID to update
            update_data: Fields to update

        Returns:
            UserWithRolesListItem with updated user data or None if not found
        """
        # Update the user
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.utcnow()

        user = await UserRepository.update(
            db, id_value=user_id, obj_in=update_dict, commit=True
        )

        if not user:
            return None

        # Load user with roles and business units using repository
        user_with_data = await UserRepository.find_by_id_with_roles_and_business_units(
            db, str(user_id)
        )

        if not user_with_data:
            return None

        # Build enriched response
        roles = [
            UserRoleInfo(id=ur.role.id, name=ur.role.name)
            for ur in user_with_data.user_roles
            if ur.role
        ]
        role_ids = [ur.role_id for ur in user_with_data.user_roles]

        business_units = [
            UserBusinessUnitInfo(
                id=assign.business_unit.id,
                name=assign.business_unit.name,
                is_active=assign.business_unit.is_active,
            )
            for assign in user_with_data.business_unit_assigns
            if assign.business_unit
        ]

        return UserWithRolesListItem(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            email=user.email,
            title=user.title,
            is_technician=user.is_technician,
            is_active=user.is_active,
            is_online=user.is_online,
            is_super_admin=user.is_super_admin,
            is_domain=user.is_domain,
            is_blocked=user.is_blocked,
            block_message=user.block_message,
            manager_id=user.manager_id,
            roles=roles,
            role_ids=role_ids,
            business_units=business_units,
        )

    @staticmethod
    @transactional_database_operation("bulk_update_status")
    @log_database_operation("bulk user status update", level="debug")
    async def bulk_update_status(
        db: AsyncSession, user_ids: List[UUID], is_active: bool
    ) -> List[UserWithRolesListItem]:
        """
        Bulk update user activation status.

        Args:
            db: Database session
            user_ids: List of user IDs to update
            is_active: New active status

        Returns:
            List of updated users with roles and business units
        """
        updated_users = []
        for user_id in user_ids:
            update_data = UserUpdate(is_active=is_active)
            user_item = await UserService.update_user_with_enrichment(
                db=db, user_id=user_id, update_data=update_data
            )
            if user_item:
                updated_users.append(user_item)

        return updated_users

    @staticmethod
    @transactional_database_operation("bulk_update_technician")
    @log_database_operation("bulk user technician update", level="debug")
    async def bulk_update_technician(
        db: AsyncSession, user_ids: List[UUID], is_technician: bool
    ) -> List[UserWithRolesListItem]:
        """
        Bulk update user technician status.

        Args:
            db: Database session
            user_ids: List of user IDs to update
            is_technician: New technician status

        Returns:
            List of updated users with roles and business units
        """
        updated_users = []
        for user_id in user_ids:
            update_data = UserUpdate(is_technician=is_technician)
            user_item = await UserService.update_user_with_enrichment(
                db=db, user_id=user_id, update_data=update_data
            )
            if user_item:
                updated_users.append(user_item)

        return updated_users

    @staticmethod
    @safe_database_query("get_user_pages", default_return=[])
    @log_database_operation("user pages retrieval", level="debug")
    async def get_user_pages(db: AsyncSession, user_id: UUID) -> List[Page]:
        """
        Get all pages accessible to a user based on their roles.

        IMPORTANT: This method automatically includes parent pages in the hierarchy
        to ensure proper navigation display. If a user has access to a child page,
        all parent pages up to the root level are automatically included.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            List of pages the user can access (direct permissions + all parent pages)

        Raises:
            ValueError: If user not found
        """
        logger.debug(f"Loading navigation for user_id={user_id}")

        # Fetch user to verify existence
        user_query = select(User).where(User.id == user_id)
        user_result = await db.execute(user_query)
        user = user_result.scalar_one_or_none()

        if not user:
            logger.debug(f"User not found: user_id={user_id}")
            raise ValueError("User not found")

        logger.debug(
            f"User found: username={user.username}, is_super_admin={user.is_super_admin}"
        )

        # If user is super admin, return all active pages
        if user.is_super_admin:
            pages_query = select(Page).where(Page.is_active).order_by(Page.id)
            pages_result = await db.execute(pages_query)
            pages = list(pages_result.scalars().all())
            logger.debug(f"Super admin - loaded {len(pages)} pages")
            logger.debug(f"Super admin page IDs: {[p.id for p in pages]}")
            return pages

        # Get user's role IDs
        user_roles_query = select(UserRole.role_id).where(UserRole.user_id == user_id)
        user_roles_result = await db.execute(user_roles_query)
        role_ids = [row[0] for row in user_roles_result.all()]

        logger.debug(f"User role_ids: {role_ids}")

        # Get pages with no role restrictions (public pages)
        public_pages_query = (
            select(Page)
            .where(Page.is_active)
            .where(~Page.id.in_(select(PageRole.page_id)))
            .order_by(Page.id)
        )
        public_pages_result = await db.execute(public_pages_query)
        public_pages = list(public_pages_result.scalars().all())

        logger.debug(f"Public pages (no role restrictions): {len(public_pages)}")
        logger.debug(f"Public page IDs: {[p.id for p in public_pages]}")

        # If user has no roles, return only public pages
        if not role_ids:
            logger.debug("User has no roles assigned - returning only public pages")
            return public_pages

        # Get pages accessible through user's roles
        page_roles_query = (
            select(PageRole.page_id)
            .where(PageRole.role_id.in_(role_ids))
            .where(PageRole.is_active)
            .distinct()
        )
        page_roles_result = await db.execute(page_roles_query)
        page_ids = [row[0] for row in page_roles_result.all()]

        logger.debug(f"Page IDs found for user's roles: {page_ids}")

        # Fetch the actual pages user has access to through roles
        if page_ids:
            pages_query = (
                select(Page)
                .where(Page.id.in_(page_ids))
                .where(Page.is_active)
                .order_by(Page.id)
            )
            pages_result = await db.execute(pages_query)
            role_pages = list(pages_result.scalars().all())
        else:
            role_pages = []

        # Combine public pages and role-based pages (avoid duplicates)
        pages_dict = {page.id: page for page in public_pages}
        for page in role_pages:
            pages_dict[page.id] = page

        pages = list(pages_dict.values())

        logger.debug(f"Direct pages from permissions: {len(pages)}")
        logger.debug(f"Direct page IDs: {[p.id for p in pages]}")

        # AUTO-INCLUDE PARENT PAGES
        pages_dict = {page.id: page for page in pages}
        parent_ids_to_fetch = set()

        # Collect all parent IDs from the pages we have
        for page in pages:
            if page.parent_id and page.parent_id not in pages_dict:
                parent_ids_to_fetch.add(page.parent_id)

        # Recursively fetch parent pages up the hierarchy
        while parent_ids_to_fetch:
            logger.debug(f"Fetching parent pages: {parent_ids_to_fetch}")

            parent_pages_query = (
                select(Page).where(Page.id.in_(parent_ids_to_fetch)).where(Page.is_active)
            )
            parent_pages_result = await db.execute(parent_pages_query)
            parent_pages = list(parent_pages_result.scalars().all())

            # Add fetched parents to our pages dict
            new_parent_ids = set()
            for parent_page in parent_pages:
                if parent_page.id not in pages_dict:
                    pages_dict[parent_page.id] = parent_page
                    logger.debug(
                        f"Auto-included parent: {parent_page.id} ({parent_page.title})"
                    )

                    # Check if this parent also has a parent
                    if parent_page.parent_id and parent_page.parent_id not in pages_dict:
                        new_parent_ids.add(parent_page.parent_id)

            # Continue with grandparents, etc.
            parent_ids_to_fetch = new_parent_ids

        # Convert dict back to list
        final_pages = list(pages_dict.values())

        logger.debug(f"Returning {len(final_pages)} pages (including auto-added parents)")
        logger.debug(f"Final page IDs: {[p.id for p in final_pages]}")
        logger.debug(f"Final page titles: {[p.title for p in final_pages]}")

        # DEBUG: Log full page details
        for page in final_pages:
            logger.debug(
                f"Page {page.id}: path={page.path}, title={page.title}, icon={page.icon}, parent_id={page.parent_id}, is_active={page.is_active}"
            )

        return final_pages

    # Section management methods (using technician_sections table)
    @staticmethod
    @log_database_operation("Section assignment")
    async def add_user_section(
        db: AsyncSession,
        user_id: UUID,
        section_id: int,
        assigned_by: UUID,
    ) -> TechnicianSection:
        """Assign a section to a user via technician_sections table."""
        from api.repositories.setting.user_section_repository import UserSectionRepository

        assignment = await UserSectionRepository.assign_section(db, user_id, section_id, assigned_by)
        await db.commit()

        logger.info(f"Assigned section {section_id} to user {user_id}")
        return assignment

    @staticmethod
    @log_database_operation("Section removal")
    async def remove_user_section(
        db: AsyncSession,
        user_id: UUID,
        section_id: int,
    ) -> bool:
        """Remove a section assignment from a user."""
        from api.repositories.setting.user_section_repository import UserSectionRepository

        removed = await UserSectionRepository.remove_section(db, user_id, section_id)
        await db.commit()

        if removed:
            logger.info(f"Removed section {section_id} from user {user_id}")
        else:
            logger.warning(f"Section {section_id} assignment not found for user {user_id}")
        return removed

    @staticmethod
    @log_database_operation("Section list")
    async def get_user_sections(
        db: AsyncSession,
        user_id: UUID,
    ) -> List[TechnicianSection]:
        """Get all sections assigned to a user."""
        from api.repositories.setting.user_section_repository import UserSectionRepository

        sections = await UserSectionRepository.get_sections_for_user(db, user_id)
        logger.debug(f"Found {len(sections)} sections for user {user_id}")
        return sections

    @staticmethod
    @safe_database_query("get_user_section_ids", default_return=[])
    @log_database_operation("Section IDs retrieval", level="debug")
    async def get_user_section_ids(
        db: AsyncSession,
        user_id: UUID,
    ) -> List[int]:
        """Get all section IDs assigned to a user."""
        from api.repositories.setting.user_section_repository import UserSectionRepository

        return await UserSectionRepository.get_section_ids_for_user(db, user_id)

    @staticmethod
    @log_database_operation("Section bulk assignment")
    async def set_user_sections(
        db: AsyncSession,
        user_id: UUID,
        section_ids: List[int],
        assigned_by: UUID,
    ) -> List[TechnicianSection]:
        """Set all sections for a user, replacing existing assignments."""
        from api.repositories.setting.user_section_repository import UserSectionRepository

        result = await UserSectionRepository.set_sections(db, user_id, section_ids, assigned_by)
        await db.commit()

        logger.info(f"Set sections for user {user_id}: {section_ids}")
        return result
