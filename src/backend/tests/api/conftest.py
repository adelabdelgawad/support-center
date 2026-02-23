"""
HTTP endpoint test fixtures and configuration.

Provides:
- HTTP test client with dependency overrides
- Mock external services (SignalR, MinIO, LDAP, Redis, Scheduler)
- Pre-seeded data fixtures for all entities
- Authenticated and unauthenticated clients
"""

from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import (
    get_current_user,
    get_optional_user,
    require_admin,
    require_technician,
    require_super_admin,
    require_supervisor,
)
from tests.factories import (
    UserFactory,
    RoleFactory,
    PriorityFactory,
    RequestStatusFactory,
    CategoryFactory,
    BusinessUnitFactory,
    BusinessUnitRegionFactory,
    ServiceRequestFactory,
    PageFactory,
)
from db.models import (
    User,
    Role,
    Priority,
    RequestStatus,
    Category,
    BusinessUnit,
    BusinessUnitRegion,
    ServiceRequest,
    Page,
)


# ============================================================================
# FastAPI App with Dependency Overrides
# ============================================================================


@pytest_asyncio.fixture
async def test_app(db_session: AsyncSession, seed_user: User, seed_admin_user: User):
    """Create FastAPI app with dependency overrides for testing.

    Overrides:
    - get_session: Use test database session
    - Auth dependencies: Return pre-created test users
    - External services: Mocked (SignalR, MinIO, LDAP, Redis)
    """
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from api.routes import root_router, health_router
    from core.app_setup.routers import register_all_routers

    # Create minimal app WITHOUT lifespan (skip DB init, scheduler, etc.)
    app = FastAPI(
        title="Test App",
        version="0.0.1",
        lifespan=None,  # Skip lifespan events in tests
    )

    # Add minimal CORS for testing
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(root_router)
    app.include_router(health_router)
    register_all_routers(app)

    # Dependency overrides
    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        """Override get_session to use test database session."""
        yield db_session

    async def override_get_current_user() -> User:
        """Override get_current_user to return seed_user."""
        return seed_user

    async def override_get_optional_user() -> User:
        """Override get_optional_user to return seed_user."""
        return seed_user

    async def override_require_admin() -> User:
        """Override require_admin to return seed_admin_user."""
        return seed_admin_user

    async def override_require_technician() -> User:
        """Override require_technician to return seed_admin_user."""
        return seed_admin_user

    async def override_require_super_admin() -> User:
        """Override require_super_admin to return seed_admin_user."""
        return seed_admin_user

    async def override_require_supervisor() -> User:
        """Override require_supervisor to return seed_admin_user."""
        return seed_admin_user

    # Apply overrides
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_optional_user] = override_get_optional_user
    app.dependency_overrides[require_admin] = override_require_admin
    app.dependency_overrides[require_technician] = override_require_technician
    app.dependency_overrides[require_super_admin] = override_require_super_admin
    app.dependency_overrides[require_supervisor] = override_require_supervisor

    yield app

    # Cleanup
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(test_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client with auth dependencies overridden.

    Use this for testing authenticated endpoints.
    """
    async with AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://test",
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def unauth_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client WITHOUT auth overrides.

    Use this for testing:
    - Login endpoints
    - 401 responses
    - Unauthenticated access
    """
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from api.routes import root_router, health_router
    from core.app_setup.routers import register_all_routers

    # Create minimal app WITHOUT auth overrides
    app = FastAPI(
        title="Test App (Unauth)",
        version="0.0.1",
        lifespan=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(root_router)
    app.include_router(health_router)
    register_all_routers(app)

    # Only override database session (no auth overrides)
    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ============================================================================
# External Service Mocks
# ============================================================================


@pytest.fixture(autouse=True)
def mock_signalr_client():
    """Auto-mock SignalR client for all API tests."""
    with patch("api.services.signalr_client.signalr_client") as mock:
        mock.is_user_online = AsyncMock(return_value=False)
        mock.send_notification = AsyncMock()
        mock.send_message = AsyncMock()
        mock.broadcast_request_update = AsyncMock()
        yield mock


@pytest.fixture(autouse=True)
def mock_minio_service():
    """Auto-mock MinIO for all API tests."""
    with patch("api.services.minio_service.MinIOStorageService") as mock_class:
        mock_instance = MagicMock()
        mock_instance.upload_file = AsyncMock(return_value="http://test-minio/test-file.png")
        mock_instance.download_file = AsyncMock(return_value=b"test-content")
        mock_instance.delete_file = AsyncMock()
        mock_instance.file_exists = AsyncMock(return_value=True)
        mock_instance.get_presigned_url = AsyncMock(return_value="http://test-minio/presigned-url")
        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_ldap_service():
    """Mock LDAP for AD-related tests."""
    with patch("api.services.active_directory.LdapService") as mock:
        instance = mock.return_value
        instance.authenticate_user = AsyncMock(return_value=True)
        instance.get_user_by_username = AsyncMock()
        instance.discover_ous = AsyncMock(return_value=[])
        instance.sync_users_from_ou = AsyncMock(return_value=[])
        yield instance


@pytest.fixture
def mock_redis():
    """Mock Redis for presence/cache tests."""
    with patch("api.services.presence_service.PresenceRedisService") as mock_class:
        mock_instance = MagicMock()
        mock_instance.is_user_online = AsyncMock(return_value=False)
        mock_instance.set_present = AsyncMock(return_value=True)
        mock_instance.set_absent = AsyncMock(return_value=True)
        mock_instance.get_user_sessions = AsyncMock(return_value=[])
        mock_instance.get_all_online_users = AsyncMock(return_value=[])
        mock_instance.is_available = True
        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_scheduler():
    """Mock APScheduler for scheduler tests."""
    with patch("core.scheduler.scheduler") as mock:
        mock.get_jobs = MagicMock(return_value=[])
        mock.add_job = MagicMock()
        mock.remove_job = MagicMock()
        mock.pause_job = MagicMock()
        mock.resume_job = MagicMock()
        mock.running = True
        yield mock


# ============================================================================
# Pre-Seeded Data Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def seed_user(db_session: AsyncSession) -> User:
    """Create a regular user for testing."""
    user = UserFactory.create(
        username="testuser",
        email="testuser@test.com",
        full_name="Test User",
        is_active=True,
        is_technician=False,
        is_super_admin=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def seed_admin_user(db_session: AsyncSession) -> User:
    """Create an admin user for testing."""
    user = UserFactory.create_admin(
        username="adminuser",
        email="admin@test.com",
        full_name="Admin User",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def seed_role(db_session: AsyncSession) -> Role:
    """Create a test role."""
    role = RoleFactory.create(
        name="Test Role",
        ar_name="دور اختبار",
        description="Test role description",
        is_active=True,
    )
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def seed_priority(db_session: AsyncSession) -> Priority:
    """Create a test priority."""
    priority = PriorityFactory.create(
        name="Medium",
        name_en="Medium",
        name_ar="متوسط",
        response_time_minutes=240,
        resolution_time_hours=24,
        order=3,
        is_active=True,
    )
    db_session.add(priority)
    await db_session.commit()
    await db_session.refresh(priority)
    return priority


@pytest_asyncio.fixture
async def seed_request_status(db_session: AsyncSession) -> RequestStatus:
    """Create a test request status."""
    status = RequestStatusFactory.create(
        name="Open",
        name_en="Open",
        name_ar="مفتوح",
        color="#10B981",
        order=2,
        is_active=True,
        count_as_solved=False,
    )
    db_session.add(status)
    await db_session.commit()
    await db_session.refresh(status)
    return status


@pytest_asyncio.fixture
async def seed_category(db_session: AsyncSession) -> Category:
    """Create a test category."""
    category = CategoryFactory.create(
        name="Hardware",
        name_en="Hardware",
        name_ar="الأجهزة",
        is_active=True,
    )
    db_session.add(category)
    await db_session.commit()
    await db_session.refresh(category)
    return category


@pytest_asyncio.fixture
async def seed_region(db_session: AsyncSession) -> BusinessUnitRegion:
    """Create a test business unit region."""
    region = BusinessUnitRegionFactory.create(
        name="Test Region",
        ar_name="منطقة اختبار",
        is_active=True,
    )
    db_session.add(region)
    await db_session.commit()
    await db_session.refresh(region)
    return region


@pytest_asyncio.fixture
async def seed_business_unit(
    db_session: AsyncSession, seed_region: BusinessUnitRegion
) -> BusinessUnit:
    """Create a test business unit."""
    business_unit = BusinessUnitFactory.create(
        name="Test Business Unit",
        ar_name="وحدة عمل اختبار",
        region_id=seed_region.id,
        is_active=True,
    )
    db_session.add(business_unit)
    await db_session.commit()
    await db_session.refresh(business_unit)
    return business_unit


@pytest_asyncio.fixture
async def seed_service_request(
    db_session: AsyncSession,
    seed_user: User,
    seed_request_status: RequestStatus,
    seed_priority: Priority,
) -> ServiceRequest:
    """Create a test service request."""
    request = ServiceRequestFactory.create(
        title="Test Service Request",
        description="Test request description",
        requester_id=seed_user.id,
        status_id=seed_request_status.id,
        priority_id=seed_priority.id,
    )
    db_session.add(request)
    await db_session.commit()
    await db_session.refresh(request)
    return request


@pytest_asyncio.fixture
async def seed_page(db_session: AsyncSession) -> Page:
    """Create a test page."""
    page = PageFactory.create(
        title="Test Page",
        path="/test-page",
        icon="test-icon",
        order=1,
        is_active=True,
    )
    db_session.add(page)
    await db_session.commit()
    await db_session.refresh(page)
    return page
