"""
Permission Caching Service

Implements robust permission caching with Redis:
1. Cache permissions on user login (always fresh)
2. Invalidate cache on role/page updates
3. Cache-aside pattern for permission checks

Cache Strategy:
- Cache user permissions in Redis without TTL (persistent)
- Invalidate on role/page changes
- Refresh on login
- Lazy reload on cache miss
"""

from typing import List, Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.cache import cache, NO_TTL
from core.decorators import safe_database_query, log_database_operation
from models.database_models import User, UserRole, Role, Page, PageRole


class PermissionCacheService:
    """Service for caching and managing user permissions."""

    # Cache key patterns
    USER_PERMISSIONS_KEY = "user:permissions:{user_id}"
    USER_PAGES_KEY = "user:pages:{user_id}"
    USER_ROLES_KEY = "user:roles:{user_id}"

    @staticmethod
    def _get_user_permissions_key(user_id: str) -> str:
        """Get Redis key for user permissions."""
        return PermissionCacheService.USER_PERMISSIONS_KEY.format(user_id=user_id)

    @staticmethod
    def _get_user_pages_key(user_id: str) -> str:
        """Get Redis key for user pages."""
        return PermissionCacheService.USER_PAGES_KEY.format(user_id=user_id)

    @staticmethod
    def _get_user_roles_key(user_id: str) -> str:
        """Get Redis key for user roles."""
        return PermissionCacheService.USER_ROLES_KEY.format(user_id=user_id)

    @staticmethod
    async def _load_permissions_from_db(
        user_id: str, db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Load user permissions from database.

        Returns dict with:
        - roles: List of role names
        - pages: List of page IDs user has access to
        - is_super_admin: Boolean
        """
        # Load user with roles
        result = await db.execute(
            select(User)
            .where(User.id == user_id)
            .options(
                selectinload(User.user_roles).selectinload(UserRole.role)
            )
        )
        user = result.scalar_one_or_none()

        if not user:
            return {
                "roles": [],
                "pages": [],
                "is_super_admin": False,
            }

        # Get role names
        role_names = [user_role.role.name for user_role in user.user_roles if user_role.role]

        # Get all pages accessible to user's roles
        role_ids = [user_role.role_id for user_role in user.user_roles]

        if role_ids:
            # Get pages for these roles
            pages_result = await db.execute(
                select(PageRole.page_id)
                .where(PageRole.role_id.in_(role_ids))
                .distinct()
            )
            page_ids = [row[0] for row in pages_result.all()]
        else:
            page_ids = []

        return {
            "roles": role_names,
            "pages": page_ids,
            "is_super_admin": user.is_super_admin,
        }

    @staticmethod
    async def refresh_user_permissions(user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """
        Refresh user permissions in cache.

        Called:
        1. On user login (always fresh permissions)
        2. After role/page updates (explicit refresh)

        Returns the permissions dict.
        """
        # Load from database
        permissions = await PermissionCacheService._load_permissions_from_db(user_id, db)

        # Store in Redis without TTL (persistent)
        cache_key = PermissionCacheService._get_user_permissions_key(user_id)
        await cache.set(
            cache_key,
            permissions,  # cache.set() handles JSON serialization
            ttl=NO_TTL
        )

        return permissions

    @staticmethod
    async def get_user_permissions(
        user_id: str, db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Get user permissions (cache-aside pattern).

        1. Check Redis cache
        2. If miss, load from DB and cache
        3. Return permissions
        """
        cache_key = PermissionCacheService._get_user_permissions_key(user_id)

        # Try to get from cache
        cached_data = await cache.get(cache_key)

        if cached_data:
            # cache.get() already deserializes JSON, return directly
            return cached_data

        # Cache miss or invalid - load from DB and cache
        return await PermissionCacheService.refresh_user_permissions(user_id, db)

    @staticmethod
    async def invalidate_user_permissions(user_id: str) -> None:
        """
        Invalidate user permissions cache.

        Called when:
        1. User roles are updated
        2. Role pages are updated (affects all users with that role)
        3. User is deleted/deactivated
        """
        cache_key = PermissionCacheService._get_user_permissions_key(user_id)
        await cache.delete(cache_key)

    @staticmethod
    async def invalidate_role_users(role_id: int, db: AsyncSession) -> None:
        """
        Invalidate permissions for all users with a specific role.

        Called when:
        1. Role pages are updated
        2. Role is deleted
        """
        # Get all users with this role
        result = await db.execute(
            select(UserRole.user_id)
            .where(UserRole.role_id == role_id)
            .distinct()
        )
        user_ids = [row[0] for row in result.all()]

        # Invalidate cache for each user
        for user_id in user_ids:
            await PermissionCacheService.invalidate_user_permissions(user_id)

    @staticmethod
    async def user_has_role(
        user_id: str, role_name: str, db: AsyncSession
    ) -> bool:
        """Check if user has a specific role."""
        permissions = await PermissionCacheService.get_user_permissions(user_id, db)

        # Super admins have all roles
        if permissions.get("is_super_admin"):
            return True

        return role_name in permissions.get("roles", [])

    @staticmethod
    async def user_has_page_access(
        user_id: str, page_id: int, db: AsyncSession
    ) -> bool:
        """Check if user has access to a specific page."""
        permissions = await PermissionCacheService.get_user_permissions(user_id, db)

        # Super admins have access to all pages
        if permissions.get("is_super_admin"):
            return True

        return page_id in permissions.get("pages", [])

    @staticmethod
    async def get_user_accessible_pages(
        user_id: str, db: AsyncSession
    ) -> List[int]:
        """Get list of page IDs user has access to."""
        permissions = await PermissionCacheService.get_user_permissions(user_id, db)

        if permissions.get("is_super_admin"):
            # Super admins have access to all pages - return all page IDs
            result = await db.execute(select(Page.id))
            return [row[0] for row in result.all()]

        return permissions.get("pages", [])


# Singleton instance
permission_cache = PermissionCacheService()
