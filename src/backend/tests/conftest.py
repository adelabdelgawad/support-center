"""
Pytest configuration and fixtures for testing.

Provides:
- Database fixtures (PostgreSQL for full compatibility)
- Mock services (LDAP, cache, etc.)
- Test data factories

Usage:
    # Run with default test database (uses docker-compose postgres on port 5433)
    uv run pytest tests/ -v

    # Run with custom test database
    TEST_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5434/test_db" uv run pytest
"""

import asyncio
import os
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from db.models import (
    User, Role, Page, UserRole
)
# SessionType is now an enum, not a table
from db.enums import SessionType
from api.schemas.domain_user import DomainUser


# ============================================================================
# Database Configuration
# ============================================================================

# Default test database URL - uses the same postgres from docker-compose (port 5433)
# but with a separate test database
# Uses environment variable from .env or falls back to default
DEFAULT_TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    # Fallback: derive from DATABASE_URL if available, or use default
    os.environ.get("DATABASE_URL", "").replace("/servicecatalog", "/it_catalog_test")
    or "postgresql+asyncpg://servicecatalog:servicecatalog@localhost:5433/it_catalog_test"
)

TEST_DATABASE_URL = DEFAULT_TEST_DB_URL


# ============================================================================
# Database Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create PostgreSQL engine for testing.

    Uses NullPool to avoid connection pooling issues in tests.
    Schema must already exist (run alembic migrations before testing).
    """
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,  # Disable pooling for tests
        echo=False,  # Set to True for SQL debugging
    )

    # Just create tables if they don't exist (don't drop - circular deps)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh database session for each test.

    Uses connection-level transaction for test isolation - all changes are rolled back.
    """
    connection = await test_engine.connect()
    transaction = await connection.begin()

    # Create session bound to the connection
    async_session_maker = sessionmaker(
        bind=connection,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=True,
    )

    session = async_session_maker()
    try:
        yield session
    finally:
        await session.close()
        # Rollback the transaction - this undoes all test changes
        if transaction.is_active:
            await transaction.rollback()
        await connection.close()


# ============================================================================
# Cache Fixtures
# ============================================================================

@pytest.fixture
def mock_cache():
    """Mock Redis cache manager."""
    cache = MagicMock()
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock(return_value=True)
    cache.delete = AsyncMock(return_value=True)
    cache.delete_pattern = AsyncMock(return_value=0)
    return cache


# ============================================================================
# LDAP/Active Directory Fixtures
# ============================================================================

@pytest.fixture
def mock_ldap_service():
    """Mock LDAP service for AD authentication."""
    from api.services.active_directory import LdapService

    ldap_service = MagicMock(spec=LdapService)
    ldap_service.authenticate_user = AsyncMock(return_value=True)
    ldap_service.get_user_by_username = AsyncMock()

    return ldap_service


@pytest.fixture
def sample_domain_user():
    """Sample Active Directory user data."""
    return DomainUser(
        username="test.user",
        email="test.user@example.com",
        full_name="Test User",
        phone_number="1234567890",
        manager_username="manager.user",
        title="Software Engineer",
        department="IT",
    )


# ============================================================================
# Database Test Data Fixtures
# ============================================================================

@pytest_asyncio.fixture
async def sample_role(db_session: AsyncSession) -> Role:
    """Create a sample role for testing."""
    role = Role(
        name="Test Role",
        description="A test role",
        ar_name="دور اختبار",
    )
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def sample_page(db_session: AsyncSession) -> Page:
    """Create a sample page for testing."""
    page = Page(
        title="Test Page",
        description="A test page",
        path="/test",
        icon="test-icon",
        order=1,
    )
    db_session.add(page)
    await db_session.commit()
    await db_session.refresh(page)
    return page


@pytest_asyncio.fixture
async def sample_user(db_session: AsyncSession) -> User:
    """Create a sample user for testing."""
    user = User(
        username="testuser",
        email="testuser@example.com",
        full_name="Test User",
        is_active=True,
        is_technician=False,
        is_domain=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_ad_user(db_session: AsyncSession, sample_role: Role) -> User:
    """Create a sample Active Directory user with role."""
    user = User(
        username="ad.user",
        email="ad.user@example.com",
        full_name="AD User",
        phone_number="9876543210",
        is_active=True,
        is_technician=False,
        is_domain=True,
        password_hash=None,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Add role to user
    user_role = UserRole(user_id=user.id, role_id=sample_role.id)
    db_session.add(user_role)
    await db_session.commit()

    return user


@pytest.fixture
def session_type() -> SessionType:
    """Return session type enum for testing (no longer a table)."""
    # SessionType is now an enum, not a database table
    return SessionType.DESKTOP  # Value = 2


# ============================================================================
# Mock Request Fixtures
# ============================================================================

@pytest.fixture
def mock_request():
    """Mock FastAPI request object."""
    from fastapi import Request

    request = MagicMock(spec=Request)
    request.client.host = "127.0.0.1"
    request.headers = {"user-agent": "test-agent"}
    return request
