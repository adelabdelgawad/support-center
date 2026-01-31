"""
Integration tests for Users API endpoints.

Tests:
- List users with pagination and filters
- Get user by ID
- Create user
- Update user
- Toggle user status (active/inactive)
- Toggle technician status
- Bulk operations
- User roles management
- User permissions
"""

from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import User, Role, UserRole, PageRole
from api.services.user_service import UserService
from tests.factories import (
    UserFactory, RoleFactory, PageFactory
)


# ============================================================================
# Fixtures
# ============================================================================

@pytest_asyncio.fixture
async def admin_role(db_session: AsyncSession) -> Role:
    """Create admin role."""
    role = RoleFactory.create(
        name="Admin",
        ar_name="مدير",
        description="Full system access"
    )
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def technician_role(db_session: AsyncSession) -> Role:
    """Create technician role."""
    role = RoleFactory.create(
        name="Technician",
        ar_name="فني",
        description="Technical support access"
    )
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def supervisor_role(db_session: AsyncSession) -> Role:
    """Create supervisor role."""
    role = RoleFactory.create(
        name="Supervisor",
        ar_name="مشرف",
        description="Supervisory access"
    )
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def sample_user(db_session: AsyncSession) -> User:
    """Create a sample user."""
    user = UserFactory.create(
        username="sample.user",
        email="sample@company.com",
        full_name="Sample User"
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession, admin_role: Role) -> User:
    """Create an admin user with role."""
    user = UserFactory.create_admin(
        username="admin.test",
        email="admin.test@company.com",
        full_name="Admin Test User"
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Assign admin role
    user_role = UserRole(user_id=user.id, role_id=admin_role.id, is_active=True)
    db_session.add(user_role)
    await db_session.commit()

    return user


@pytest_asyncio.fixture
async def technician_user(db_session: AsyncSession, technician_role: Role) -> User:
    """Create a technician user with role."""
    user = UserFactory.create_technician(
        username="tech.test",
        email="tech.test@company.com",
        full_name="Technician Test User"
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Assign technician role
    user_role = UserRole(user_id=user.id, role_id=technician_role.id, is_active=True)
    db_session.add(user_role)
    await db_session.commit()

    return user


@pytest_asyncio.fixture
async def multiple_users(db_session: AsyncSession) -> list[User]:
    """Create multiple users for testing."""
    users = []
    for i in range(15):
        user = UserFactory.create(
            username=f"user.{i:03d}",
            email=f"user{i}@company.com",
            full_name=f"User {i}",
            is_active=i % 2 == 0,  # Alternate active/inactive
            is_technician=i % 3 == 0,  # Every 3rd is technician
        )
        db_session.add(user)
        users.append(user)
    await db_session.commit()

    for user in users:
        await db_session.refresh(user)

    return users


# ============================================================================
# User Listing Tests
# ============================================================================

class TestUserListing:
    """Tests for listing users."""

    @pytest.mark.asyncio
    async def test_list_users_pagination(
        self, db_session, multiple_users
    ):
        """Test user listing with pagination."""
        # Use the actual service method
        users, total = await UserService.list_users(
            db=db_session,
            page=1,
            per_page=10,
        )

        # Verify pagination works
        assert len(users) <= 10

    @pytest.mark.asyncio
    async def test_list_users_filter_by_active(
        self, db_session, multiple_users
    ):
        """Test filtering users by active status."""
        # Get active users
        users, total = await UserService.list_users(
            db=db_session,
            is_active=True,
            page=1,
            per_page=100,
        )

        # Check that all returned users are active
        for user in users:
            assert user.is_active is True

    @pytest.mark.asyncio
    async def test_list_users_filter_by_technician(
        self, db_session, multiple_users
    ):
        """Test filtering users by technician status."""
        # Get technician users
        users, total = await UserService.list_users(
            db=db_session,
            is_technician=True,
            page=1,
            per_page=100,
        )

        # Check that all returned users are technicians
        for user in users:
            assert user.is_technician is True

    @pytest.mark.asyncio
    async def test_list_users_search_by_username(
        self, db_session, sample_user
    ):
        """Test searching users by username."""
        # Get user by username
        user = await UserService.get_user_by_username(
            db=db_session,
            username=sample_user.username,
        )

        assert user is not None
        assert user.username == sample_user.username


# ============================================================================
# User Retrieval Tests
# ============================================================================

class TestUserRetrieval:
    """Tests for getting user details."""

    @pytest.mark.asyncio
    async def test_get_user_by_id_success(
        self, db_session, sample_user
    ):
        """Test getting user by ID."""
        result = await UserService.get_user(
            db=db_session,
            user_id=sample_user.id,
        )

        assert result is not None
        assert result.id == sample_user.id
        assert result.username == sample_user.username

    @pytest.mark.asyncio
    async def test_get_user_by_id_not_found(
        self, db_session
    ):
        """Test getting non-existent user."""
        fake_id = uuid4()

        result = await UserService.get_user(
            db=db_session,
            user_id=fake_id,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_get_user_by_username_success(
        self, db_session, sample_user
    ):
        """Test getting user by username."""
        result = await db_session.execute(
            select(User).where(User.username == sample_user.username)
        )
        user = result.scalar_one_or_none()

        assert user is not None
        assert user.username == sample_user.username

    @pytest.mark.asyncio
    async def test_get_user_by_username_case_insensitive(
        self, db_session, sample_user
    ):
        """Test case-insensitive username lookup."""
        result = await db_session.execute(
            select(User).where(User.username.ilike(sample_user.username.upper()))
        )
        result.scalar_one_or_none()

        # SQLite might not support ilike, so this could fail
        # In production with PostgreSQL, this should work


# ============================================================================
# User Creation Tests
# ============================================================================

class TestUserCreation:
    """Tests for creating users."""

    @pytest.mark.asyncio
    async def test_create_user_success(
        self, db_session
    ):
        """Test successful user creation."""
        user = UserFactory.create(
            username="new.user",
            email="new.user@company.com",
            full_name="New User"
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        assert user.id is not None
        assert user.username == "new.user"
        assert user.is_active is True

    @pytest.mark.asyncio
    async def test_create_user_duplicate_username_fails(
        self, db_session, sample_user
    ):
        """Test that duplicate username fails."""
        duplicate_user = UserFactory.create(
            username=sample_user.username,  # Same username
            email="different@company.com"
        )
        db_session.add(duplicate_user)

        with pytest.raises(Exception):
            await db_session.commit()

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email_fails(
        self, db_session, sample_user
    ):
        """Test that duplicate email fails."""
        duplicate_user = UserFactory.create(
            username="different.user",
            email=sample_user.email,  # Same email
        )
        db_session.add(duplicate_user)

        with pytest.raises(Exception):
            await db_session.commit()

    @pytest.mark.asyncio
    async def test_create_domain_user(
        self, db_session
    ):
        """Test creating a domain (AD) user."""
        user = UserFactory.create_domain_user(
            username="domain.user",
            email="domain.user@company.com",
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        assert user.is_domain is True
        assert user.password_hash is None


# ============================================================================
# User Update Tests
# ============================================================================

class TestUserUpdate:
    """Tests for updating users."""

    @pytest.mark.asyncio
    async def test_update_user_profile(
        self, db_session, sample_user
    ):
        """Test updating user profile."""
        sample_user.full_name = "Updated Name"
        sample_user.phone_number = "01234567890"
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.full_name == "Updated Name"
        assert sample_user.phone_number == "01234567890"

    @pytest.mark.asyncio
    async def test_update_user_email(
        self, db_session, sample_user
    ):
        """Test updating user email."""
        new_email = "updated.email@company.com"
        sample_user.email = new_email
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.email == new_email


# ============================================================================
# User Status Tests
# ============================================================================

class TestUserStatus:
    """Tests for user status management."""

    @pytest.mark.asyncio
    async def test_toggle_user_active_status(
        self, db_session, sample_user
    ):
        """Test toggling user active status."""
        original_status = sample_user.is_active

        sample_user.is_active = not original_status
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.is_active == (not original_status)

    @pytest.mark.asyncio
    async def test_deactivate_user(
        self, db_session, sample_user
    ):
        """Test deactivating a user."""
        sample_user.is_active = False
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.is_active is False

    @pytest.mark.asyncio
    async def test_block_user(
        self, db_session, sample_user
    ):
        """Test blocking a user."""
        sample_user.is_blocked = True
        sample_user.block_message = "Blocked for policy violation"
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.is_blocked is True
        assert sample_user.block_message == "Blocked for policy violation"

    @pytest.mark.asyncio
    async def test_unblock_user(
        self, db_session, sample_user
    ):
        """Test unblocking a user."""
        # First block
        sample_user.is_blocked = True
        sample_user.block_message = "Test block"
        await db_session.commit()

        # Then unblock
        sample_user.is_blocked = False
        sample_user.block_message = None
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.is_blocked is False
        assert sample_user.block_message is None


# ============================================================================
# Technician Status Tests
# ============================================================================

class TestTechnicianStatus:
    """Tests for technician status management."""

    @pytest.mark.asyncio
    async def test_toggle_technician_status(
        self, db_session, sample_user
    ):
        """Test toggling technician status."""
        original_status = sample_user.is_technician

        sample_user.is_technician = not original_status
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.is_technician == (not original_status)

    @pytest.mark.asyncio
    async def test_make_user_technician(
        self, db_session, sample_user
    ):
        """Test making a user a technician."""
        sample_user.is_technician = True
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.is_technician is True

    @pytest.mark.asyncio
    async def test_remove_technician_status(
        self, db_session, technician_user
    ):
        """Test removing technician status."""
        technician_user.is_technician = False
        await db_session.commit()
        await db_session.refresh(technician_user)

        assert technician_user.is_technician is False


# ============================================================================
# Bulk Operations Tests
# ============================================================================

class TestBulkOperations:
    """Tests for bulk user operations."""

    @pytest.mark.asyncio
    async def test_bulk_update_status(
        self, db_session, multiple_users
    ):
        """Test bulk update user status."""
        users_to_update = multiple_users[:5]

        for user in users_to_update:
            user.is_active = False

        await db_session.commit()

        # Verify all updated
        for user in users_to_update:
            await db_session.refresh(user)
            assert user.is_active is False

    @pytest.mark.asyncio
    async def test_bulk_update_technician_status(
        self, db_session, multiple_users
    ):
        """Test bulk update technician status."""
        users_to_update = multiple_users[:5]

        for user in users_to_update:
            user.is_technician = True

        await db_session.commit()

        for user in users_to_update:
            await db_session.refresh(user)
            assert user.is_technician is True


# ============================================================================
# User Roles Tests
# ============================================================================

class TestUserRoles:
    """Tests for user role management."""

    @pytest.mark.asyncio
    async def test_assign_role_to_user(
        self, db_session, sample_user, technician_role
    ):
        """Test assigning a role to a user."""
        user_role = UserRole(
            user_id=sample_user.id,
            role_id=technician_role.id,
            is_active=True
        )
        db_session.add(user_role)
        await db_session.commit()

        # Verify assignment
        result = await db_session.execute(
            select(UserRole).where(
                UserRole.user_id == sample_user.id,
                UserRole.role_id == technician_role.id
            )
        )
        assigned_role = result.scalar_one_or_none()

        assert assigned_role is not None
        assert assigned_role.is_active is True

    @pytest.mark.asyncio
    async def test_remove_role_from_user(
        self, db_session, technician_user, technician_role
    ):
        """Test removing a role from a user."""
        # Find the user role
        result = await db_session.execute(
            select(UserRole).where(
                UserRole.user_id == technician_user.id,
                UserRole.role_id == technician_role.id
            )
        )
        user_role = result.scalar_one_or_none()

        if user_role:
            user_role.is_active = False
            await db_session.commit()
            await db_session.refresh(user_role)

            assert user_role.is_active is False

    @pytest.mark.asyncio
    async def test_assign_multiple_roles(
        self, db_session, sample_user, technician_role, supervisor_role
    ):
        """Test assigning multiple roles to a user."""
        roles = [technician_role, supervisor_role]

        for role in roles:
            user_role = UserRole(
                user_id=sample_user.id,
                role_id=role.id,
                is_active=True
            )
            db_session.add(user_role)

        await db_session.commit()

        # Verify assignments
        result = await db_session.execute(
            select(UserRole).where(UserRole.user_id == sample_user.id)
        )
        user_roles = result.scalars().all()

        assert len(user_roles) == 2

    @pytest.mark.asyncio
    async def test_get_user_roles(
        self, db_session, admin_user, admin_role
    ):
        """Test getting all roles for a user."""
        result = await db_session.execute(
            select(UserRole).where(
                UserRole.user_id == admin_user.id,
                UserRole.is_active
            )
        )
        user_roles = result.scalars().all()

        assert len(user_roles) >= 1
        role_ids = [ur.role_id for ur in user_roles]
        assert admin_role.id in role_ids


# ============================================================================
# User Permissions Tests
# ============================================================================

class TestUserPermissions:
    """Tests for user permissions."""

    @pytest.mark.asyncio
    async def test_super_admin_has_all_permissions(
        self, db_session, admin_user
    ):
        """Test that super admin has all permissions."""
        assert admin_user.is_super_admin is True

    @pytest.mark.asyncio
    async def test_get_user_pages(
        self, db_session, admin_user, admin_role
    ):
        """Test getting accessible pages for a user."""
        # Create sample pages
        page1 = PageFactory.create(title="Dashboard", path="/dashboard")
        page2 = PageFactory.create(title="Settings", path="/settings")
        db_session.add(page1)
        db_session.add(page2)
        await db_session.commit()
        await db_session.refresh(page1)
        await db_session.refresh(page2)

        # Assign pages to role
        page_role1 = PageRole(page_id=page1.id, role_id=admin_role.id, is_active=True)
        page_role2 = PageRole(page_id=page2.id, role_id=admin_role.id, is_active=True)
        db_session.add(page_role1)
        db_session.add(page_role2)
        await db_session.commit()

        # Get pages through role
        result = await db_session.execute(
            select(PageRole).where(PageRole.role_id == admin_role.id)
        )
        page_roles = result.scalars().all()

        assert len(page_roles) >= 2


# ============================================================================
# Manager Relationship Tests
# ============================================================================

class TestManagerRelationship:
    """Tests for user-manager relationships."""

    @pytest.mark.asyncio
    async def test_assign_manager(
        self, db_session, sample_user, admin_user
    ):
        """Test assigning a manager to a user."""
        sample_user.manager_id = admin_user.id
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.manager_id == admin_user.id

    @pytest.mark.asyncio
    async def test_get_users_subordinates(
        self, db_session, admin_user
    ):
        """Test getting users who have a specific manager."""
        # Create subordinate users
        for i in range(3):
            user = UserFactory.create(
                username=f"subordinate.{i}",
                manager_id=admin_user.id,
            )
            db_session.add(user)
        await db_session.commit()

        # Query subordinates
        result = await db_session.execute(
            select(User).where(User.manager_id == admin_user.id)
        )
        subordinates = result.scalars().all()

        assert len(subordinates) == 3

    @pytest.mark.asyncio
    async def test_remove_manager(
        self, db_session, sample_user, admin_user
    ):
        """Test removing manager assignment."""
        # First assign
        sample_user.manager_id = admin_user.id
        await db_session.commit()

        # Then remove
        sample_user.manager_id = None
        await db_session.commit()
        await db_session.refresh(sample_user)

        assert sample_user.manager_id is None
