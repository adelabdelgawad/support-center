"""
Unit tests for permission caching service.

Tests:
- Loading permissions from database
- Caching permissions in Redis
- Cache hit/miss scenarios
- Cache invalidation
- Role-based permission checks
- Page access checks
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import select

from models.database_models import User, Role, Page, PageRole, UserRole
from services.permission_cache_service import PermissionCacheService


class TestLoadPermissionsFromDB:
    """Tests for loading user permissions from database."""

    @pytest.mark.asyncio
    async def test_load_permissions_user_not_found(self, db_session):
        """Test loading permissions for non-existent user."""
        result = await PermissionCacheService._load_permissions_from_db(
            user_id=99999, db=db_session
        )

        assert result == {
            "roles": [],
            "pages": [],
            "is_super_admin": False,
        }

    @pytest.mark.asyncio
    async def test_load_permissions_user_with_no_roles(self, db_session, sample_user):
        """Test loading permissions for user with no roles."""
        result = await PermissionCacheService._load_permissions_from_db(
            user_id=sample_user.id, db=db_session
        )

        assert result["roles"] == []
        assert result["pages"] == []
        assert result["is_super_admin"] == sample_user.is_super_admin

    @pytest.mark.asyncio
    async def test_load_permissions_user_with_roles_and_pages(
        self, db_session, sample_user, sample_role, sample_page
    ):
        """Test loading permissions for user with roles and pages."""
        # Assign role to user
        user_role = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        db_session.add(user_role)

        # Assign page to role
        page_role = PageRole(page_id=sample_page.id, role_id=sample_role.id)
        db_session.add(page_role)

        await db_session.commit()

        # Load permissions
        result = await PermissionCacheService._load_permissions_from_db(
            user_id=sample_user.id, db=db_session
        )

        assert sample_role.name in result["roles"]
        assert sample_page.id in result["pages"]

    @pytest.mark.asyncio
    async def test_load_permissions_super_admin(self, db_session, sample_user):
        """Test loading permissions for super admin."""
        sample_user.is_super_admin = True
        await db_session.commit()

        result = await PermissionCacheService._load_permissions_from_db(
            user_id=sample_user.id, db=db_session
        )

        assert result["is_super_admin"] is True

    @pytest.mark.asyncio
    async def test_load_permissions_multiple_roles(
        self, db_session, sample_user
    ):
        """Test loading permissions for user with multiple roles."""
        # Create multiple roles
        role1 = Role(name="Role 1", description="First role")
        role2 = Role(name="Role 2", description="Second role")
        db_session.add(role1)
        db_session.add(role2)
        await db_session.commit()

        # Assign both roles to user
        user_role1 = UserRole(user_id=sample_user.id, role_id=role1.id)
        user_role2 = UserRole(user_id=sample_user.id, role_id=role2.id)
        db_session.add(user_role1)
        db_session.add(user_role2)
        await db_session.commit()

        # Load permissions
        result = await PermissionCacheService._load_permissions_from_db(
            user_id=sample_user.id, db=db_session
        )

        assert len(result["roles"]) == 2
        assert "Role 1" in result["roles"]
        assert "Role 2" in result["roles"]

    @pytest.mark.asyncio
    async def test_load_permissions_multiple_pages_from_one_role(
        self, db_session, sample_user, sample_role
    ):
        """Test loading multiple pages accessible via one role."""
        # Create multiple pages
        page1 = Page(title="Page 1", path="/page1", icon="icon1", order=1)
        page2 = Page(title="Page 2", path="/page2", icon="icon2", order=2)
        db_session.add(page1)
        db_session.add(page2)
        await db_session.commit()

        # Assign role to user
        user_role = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        db_session.add(user_role)

        # Assign both pages to role
        page_role1 = PageRole(page_id=page1.id, role_id=sample_role.id)
        page_role2 = PageRole(page_id=page2.id, role_id=sample_role.id)
        db_session.add(page_role1)
        db_session.add(page_role2)
        await db_session.commit()

        # Load permissions
        result = await PermissionCacheService._load_permissions_from_db(
            user_id=sample_user.id, db=db_session
        )

        assert len(result["pages"]) == 2
        assert page1.id in result["pages"]
        assert page2.id in result["pages"]


class TestRefreshUserPermissions:
    """Tests for refreshing user permissions in cache."""

    @pytest.mark.asyncio
    async def test_refresh_permissions_success(
        self, db_session, sample_user, sample_role, sample_page
    ):
        """Test successfully refreshing user permissions in cache."""
        # Setup: user with role and page
        user_role = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        db_session.add(user_role)
        page_role = PageRole(page_id=sample_page.id, role_id=sample_role.id)
        db_session.add(page_role)
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.refresh_user_permissions(
                user_id=sample_user.id, db=db_session
            )

            # Verify result
            assert sample_role.name in result["roles"]
            assert sample_page.id in result["pages"]

            # Verify cache.set was called
            mock_cache.set.assert_called_once()
            call_args = mock_cache.set.call_args
            assert f"user:permissions:{sample_user.id}" in call_args[0][0]
            assert result == call_args[0][1]

    @pytest.mark.asyncio
    async def test_refresh_permissions_ttl_conversion(
        self, db_session, sample_user
    ):
        """Test that TTL is correctly converted to seconds."""
        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.set = AsyncMock(return_value=True)

            await PermissionCacheService.refresh_user_permissions(
                user_id=sample_user.id, db=db_session
            )

            # Verify TTL is an integer (converted from timedelta)
            call_args = mock_cache.set.call_args
            ttl_value = call_args[1]["ttl"]
            assert isinstance(ttl_value, int)
            assert ttl_value == 3600  # 1 hour in seconds


class TestGetUserPermissions:
    """Tests for getting user permissions with cache-aside pattern."""

    @pytest.mark.asyncio
    async def test_get_permissions_cache_hit(self, db_session, sample_user):
        """Test getting permissions when cache has data."""
        cached_permissions = {
            "roles": ["Admin"],
            "pages": [1, 2, 3],
            "is_super_admin": False,
        }

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=cached_permissions)

            result = await PermissionCacheService.get_user_permissions(
                user_id=sample_user.id, db=db_session
            )

            # Should return cached data
            assert result == cached_permissions
            mock_cache.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_permissions_cache_miss(
        self, db_session, sample_user, sample_role, sample_page
    ):
        """Test getting permissions when cache is empty (cache miss)."""
        # Setup: user with role and page
        user_role = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        db_session.add(user_role)
        page_role = PageRole(page_id=sample_page.id, role_id=sample_role.id)
        db_session.add(page_role)
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            # Cache miss
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.get_user_permissions(
                user_id=sample_user.id, db=db_session
            )

            # Should load from DB and cache
            assert sample_role.name in result["roles"]
            assert sample_page.id in result["pages"]

            # Verify cache.set was called to store result
            mock_cache.set.assert_called_once()


class TestInvalidatePermissions:
    """Tests for cache invalidation."""

    @pytest.mark.asyncio
    async def test_invalidate_user_permissions(self, sample_user):
        """Test invalidating single user's permissions."""
        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.delete = AsyncMock(return_value=True)

            await PermissionCacheService.invalidate_user_permissions(
                user_id=sample_user.id
            )

            # Verify cache.delete was called with correct key
            mock_cache.delete.assert_called_once()
            call_args = mock_cache.delete.call_args
            assert f"user:permissions:{sample_user.id}" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_invalidate_role_users(
        self, db_session, sample_role, sample_user
    ):
        """Test invalidating permissions for all users with a specific role."""
        # Create another user with same role
        user2 = User(
            username="user2",
            email="user2@example.com",
            full_name="User 2",
            is_active=True,
        )
        db_session.add(user2)
        await db_session.commit()

        # Assign role to both users
        user_role1 = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        user_role2 = UserRole(user_id=user2.id, role_id=sample_role.id)
        db_session.add(user_role1)
        db_session.add(user_role2)
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.delete = AsyncMock(return_value=True)

            await PermissionCacheService.invalidate_role_users(
                role_id=sample_role.id, db=db_session
            )

            # Verify cache.delete was called for both users
            assert mock_cache.delete.call_count == 2


class TestPermissionChecks:
    """Tests for role and page access checks."""

    @pytest.mark.asyncio
    async def test_user_has_role_true(
        self, db_session, sample_user, sample_role
    ):
        """Test checking if user has a specific role (true case)."""
        # Setup: user with role
        user_role = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        db_session.add(user_role)
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.user_has_role(
                user_id=sample_user.id, role_name=sample_role.name, db=db_session
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_user_has_role_false(self, db_session, sample_user):
        """Test checking if user has a specific role (false case)."""
        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.user_has_role(
                user_id=sample_user.id, role_name="Nonexistent Role", db=db_session
            )

            assert result is False

    @pytest.mark.asyncio
    async def test_user_has_role_super_admin(self, db_session, sample_user):
        """Test that super admin has all roles."""
        sample_user.is_super_admin = True
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.user_has_role(
                user_id=sample_user.id, role_name="Any Role", db=db_session
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_user_has_page_access_true(
        self, db_session, sample_user, sample_role, sample_page
    ):
        """Test checking if user has page access (true case)."""
        # Setup: user with role that has page access
        user_role = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        db_session.add(user_role)
        page_role = PageRole(page_id=sample_page.id, role_id=sample_role.id)
        db_session.add(page_role)
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.user_has_page_access(
                user_id=sample_user.id, page_id=sample_page.id, db=db_session
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_user_has_page_access_false(
        self, db_session, sample_user, sample_page
    ):
        """Test checking if user has page access (false case)."""
        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.user_has_page_access(
                user_id=sample_user.id, page_id=sample_page.id, db=db_session
            )

            assert result is False

    @pytest.mark.asyncio
    async def test_user_has_page_access_super_admin(
        self, db_session, sample_user, sample_page
    ):
        """Test that super admin has access to all pages."""
        sample_user.is_super_admin = True
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.user_has_page_access(
                user_id=sample_user.id, page_id=sample_page.id, db=db_session
            )

            assert result is True

    @pytest.mark.asyncio
    async def test_get_user_accessible_pages(
        self, db_session, sample_user, sample_role, sample_page
    ):
        """Test getting list of accessible page IDs for user."""
        # Setup: user with role that has page access
        user_role = UserRole(user_id=sample_user.id, role_id=sample_role.id)
        db_session.add(user_role)
        page_role = PageRole(page_id=sample_page.id, role_id=sample_role.id)
        db_session.add(page_role)
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.get_user_accessible_pages(
                user_id=sample_user.id, db=db_session
            )

            assert sample_page.id in result

    @pytest.mark.asyncio
    async def test_get_user_accessible_pages_super_admin(
        self, db_session, sample_user, sample_page
    ):
        """Test that super admin gets all pages."""
        sample_user.is_super_admin = True
        await db_session.commit()

        with patch("services.permission_cache_service.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            mock_cache.set = AsyncMock(return_value=True)

            result = await PermissionCacheService.get_user_accessible_pages(
                user_id=sample_user.id, db=db_session
            )

            # Should return all pages
            assert sample_page.id in result
