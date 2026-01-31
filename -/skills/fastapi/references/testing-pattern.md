# Testing Pattern Reference

Comprehensive testing patterns for FastAPI applications with pytest, async support, and dependency overrides.

## Key Principles

1. **Use async tests** - Match async endpoints with async test functions
2. **Isolate database state** - Each test gets fresh database state
3. **Override dependencies** - Inject test doubles via FastAPI's dependency override
4. **Test at multiple levels** - Unit, integration, and E2E tests
5. **Use fixtures** - Share setup logic across tests

## Project Structure

```
tests/
├── conftest.py              # Shared fixtures
├── unit/
│   ├── test_services.py     # Service unit tests
│   └── test_repositories.py # Repository tests
├── integration/
│   ├── test_items_api.py    # API endpoint tests
│   └── test_auth_api.py     # Auth flow tests
└── e2e/
    └── test_workflows.py    # Full workflow tests
```

## Core Test Fixtures (conftest.py)

```python
# tests/conftest.py
"""Shared test fixtures for pytest."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from db.models import Base
from app import app
from api.deps import get_session
from core.config import settings


# Test database URL (use SQLite for speed, or separate PostgreSQL DB)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
# Or for PostgreSQL: "postgresql+asyncpg://test:test@localhost:5432/test_db"


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,  # Important for SQLite
        echo=False,
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Drop all tables after test
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_session(test_engine):
    """Create test database session."""
    async_session_maker = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_maker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def async_client(test_session):
    """Create async HTTP client with dependency overrides."""

    # Override the database session dependency
    async def override_get_session():
        yield test_session

    app.dependency_overrides[get_session] = override_get_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    # Clear overrides after test
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def authenticated_client(async_client, test_session):
    """Create authenticated client with valid JWT."""
    from api.services.auth_service import AuthService
    from api.crud import users as users_crud

    # Create test user
    user_repo = UserRepository()
    user = await user_repo.create(
        test_session,
        username="testuser",
        email="test@example.com",
        hashed_password="hashed_password",
        is_active=True,
    )
    await test_session.commit()

    # Generate tokens
    auth_service = AuthService()
    tokens = auth_service.create_tokens(user_id=user.id, username=user.username)

    # Add auth header to client
    async_client.headers["Authorization"] = f"Bearer {tokens['access_token']}"

    yield async_client, user


@pytest.fixture
def sample_item_data():
    """Sample item data for tests."""
    return {
        "nameEn": "Test Item",
        "nameAr": "عنصر اختبار",
        "descriptionEn": "Test description",
        "descriptionAr": "وصف الاختبار",
        "price": 99.99,
        "isActive": True,
    }
```

## API Integration Tests

```python
# tests/integration/test_items_api.py
"""Integration tests for items API."""

import pytest
from httpx import AsyncClient


class TestItemsAPI:
    """Test suite for /setting/items endpoints."""

    @pytest.mark.asyncio
    async def test_create_item_success(
        self,
        authenticated_client: tuple,
        sample_item_data: dict,
    ):
        """Test successful item creation."""
        client, user = authenticated_client

        response = await client.post(
            "/setting/items",
            json=sample_item_data,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["nameEn"] == sample_item_data["nameEn"]
        assert data["nameAr"] == sample_item_data["nameAr"]
        assert "id" in data
        assert "createdAt" in data

    @pytest.mark.asyncio
    async def test_create_item_validation_error(
        self,
        authenticated_client: tuple,
    ):
        """Test item creation with invalid data."""
        client, _ = authenticated_client

        response = await client.post(
            "/setting/items",
            json={"nameEn": ""},  # Missing required fields
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_item_success(
        self,
        authenticated_client: tuple,
        sample_item_data: dict,
    ):
        """Test getting an item by ID."""
        client, _ = authenticated_client

        # First create an item
        create_response = await client.post(
            "/setting/items",
            json=sample_item_data,
        )
        item_id = create_response.json()["id"]

        # Then get it
        response = await client.get(f"/setting/items/{item_id}")

        assert response.status_code == 200
        assert response.json()["id"] == item_id

    @pytest.mark.asyncio
    async def test_get_item_not_found(
        self,
        authenticated_client: tuple,
    ):
        """Test getting non-existent item returns 404."""
        client, _ = authenticated_client

        response = await client.get("/setting/items/99999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_list_items_pagination(
        self,
        authenticated_client: tuple,
        sample_item_data: dict,
    ):
        """Test item list with pagination."""
        client, _ = authenticated_client

        # Create multiple items
        for i in range(15):
            await client.post(
                "/setting/items",
                json={**sample_item_data, "nameEn": f"Item {i}"},
            )

        # Get first page
        response = await client.get("/setting/items?page=1&perPage=10")

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 10
        assert data["total"] == 15
        assert data["hasNext"] is True

    @pytest.mark.asyncio
    async def test_update_item_success(
        self,
        authenticated_client: tuple,
        sample_item_data: dict,
    ):
        """Test updating an item."""
        client, _ = authenticated_client

        # Create item
        create_response = await client.post(
            "/setting/items",
            json=sample_item_data,
        )
        item_id = create_response.json()["id"]

        # Update item
        update_data = {"nameEn": "Updated Name"}
        response = await client.patch(
            f"/setting/items/{item_id}",
            json=update_data,
        )

        assert response.status_code == 200
        assert response.json()["nameEn"] == "Updated Name"

    @pytest.mark.asyncio
    async def test_delete_item_success(
        self,
        authenticated_client: tuple,
        sample_item_data: dict,
    ):
        """Test deleting an item."""
        client, _ = authenticated_client

        # Create item
        create_response = await client.post(
            "/setting/items",
            json=sample_item_data,
        )
        item_id = create_response.json()["id"]

        # Delete item
        response = await client.delete(f"/setting/items/{item_id}")

        assert response.status_code == 204

        # Verify deleted
        get_response = await client.get(f"/setting/items/{item_id}")
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_access_denied(
        self,
        async_client: AsyncClient,
    ):
        """Test that unauthenticated requests are rejected."""
        response = await async_client.get("/setting/items")

        assert response.status_code == 401
```

## Service Unit Tests

```python
# tests/unit/test_services.py
"""Unit tests for service layer."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from api.services.item_service import ItemService
from core.exceptions import NotFoundError, ConflictError


class TestItemService:
    """Unit tests for ItemService."""

    @pytest.fixture
    def mock_session(self):
        """Create mock database session."""
        session = AsyncMock()
        session.flush = AsyncMock()
        session.refresh = AsyncMock()
        session.commit = AsyncMock()
        return session

    @pytest.fixture
    def item_service(self):
        """Create ItemService with mocked repository."""
        service = ItemService()
        service.repository = MagicMock()
        return service

    @pytest.mark.asyncio
    async def test_create_item_success(
        self,
        mock_session,
        item_service,
    ):
        """Test successful item creation."""
        # Arrange
        mock_item = MagicMock(id=1, name_en="Test")
        item_service.repository.create = AsyncMock(return_value=mock_item)

        # Act
        result = await item_service.create_item(
            mock_session,
            name_en="Test",
            name_ar="اختبار",
        )

        # Assert
        assert result.id == 1
        item_service.repository.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_item_not_found(
        self,
        mock_session,
        item_service,
    ):
        """Test NotFoundError when item doesn't exist."""
        # Arrange
        item_service.repository.get_by_id = AsyncMock(return_value=None)

        # Act & Assert
        with pytest.raises(NotFoundError) as exc_info:
            await item_service.get_item(mock_session, item_id=99999)

        assert "not found" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_create_item_duplicate_name(
        self,
        mock_session,
        item_service,
    ):
        """Test ConflictError for duplicate name."""
        # Arrange
        existing_item = MagicMock(id=1, name_en="Existing")
        item_service.repository.get_by_name = AsyncMock(return_value=existing_item)

        # Act & Assert
        with pytest.raises(ConflictError) as exc_info:
            await item_service.create_item(
                mock_session,
                name_en="Existing",
                name_ar="موجود",
            )

        assert "already exists" in str(exc_info.value).lower()
```

## Repository Tests

```python
# tests/unit/test_repositories.py
"""Unit tests for repository layer."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.crud import items as items_crud
from db.models import Item


class TestItemRepository:
    """Tests for ItemRepository."""

    @pytest.mark.asyncio
    async def test_create_item(self, test_session: AsyncSession):
        """Test creating an item in the database."""
        repository = ItemRepository()

        item = await repository.create(
            test_session,
            name_en="Test Item",
            name_ar="عنصر اختبار",
            description_en="Description",
        )

        assert item.id is not None
        assert item.name_en == "Test Item"

    @pytest.mark.asyncio
    async def test_get_by_id(self, test_session: AsyncSession):
        """Test getting item by ID."""
        repository = ItemRepository()

        # Create item
        created = await repository.create(
            test_session,
            name_en="Test Item",
            name_ar="عنصر اختبار",
        )
        await test_session.commit()

        # Get item
        item = await repository.get_by_id(test_session, created.id)

        assert item is not None
        assert item.id == created.id

    @pytest.mark.asyncio
    async def test_list_with_filters(self, test_session: AsyncSession):
        """Test listing items with filters."""
        repository = ItemRepository()

        # Create items
        for i in range(5):
            await repository.create(
                test_session,
                name_en=f"Item {i}",
                name_ar=f"عنصر {i}",
                is_active=i % 2 == 0,  # Alternate active/inactive
            )
        await test_session.commit()

        # List only active
        items, total = await repository.list(
            test_session,
            is_active=True,
        )

        assert total == 3  # Items 0, 2, 4
```

## Authentication Tests

```python
# tests/integration/test_auth_api.py
"""Tests for authentication endpoints."""

import pytest
from httpx import AsyncClient


class TestAuthAPI:
    """Test suite for authentication."""

    @pytest.mark.asyncio
    async def test_login_success(
        self,
        async_client: AsyncClient,
        test_session,
    ):
        """Test successful login."""
        # First create a user
        from api.crud import users as users_crud
        from core.security import hash_password

        user_repo = UserRepository()
        await user_repo.create(
            test_session,
            username="testuser",
            email="test@example.com",
            hashed_password=hash_password("password123"),
            is_active=True,
        )
        await test_session.commit()

        # Login
        response = await async_client.post(
            "/setting/auth/login",
            data={
                "username": "testuser",
                "password": "password123",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "accessToken" in data
        assert "refreshToken" in data

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(
        self,
        async_client: AsyncClient,
    ):
        """Test login with wrong password."""
        response = await async_client.post(
            "/setting/auth/login",
            data={
                "username": "testuser",
                "password": "wrongpassword",
            },
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_token(
        self,
        authenticated_client: tuple,
    ):
        """Test refreshing access token."""
        client, _ = authenticated_client

        # This would need the refresh token from login
        # Implementation depends on your auth flow
        pass
```

## Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx aiosqlite

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=api --cov-report=html

# Run specific test file
pytest tests/integration/test_items_api.py -v

# Run specific test
pytest tests/integration/test_items_api.py::TestItemsAPI::test_create_item_success -v

# Run async tests only
pytest tests/ -v -m asyncio

# Run with parallel execution
pytest tests/ -v -n auto
```

## pytest.ini Configuration

```ini
# pytest.ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
filterwarnings =
    ignore::DeprecationWarning
markers =
    slow: marks tests as slow
    integration: marks tests as integration tests
```

## Key Points

1. **Use `pytest-asyncio`** - For async test functions
2. **Override dependencies** - Use `app.dependency_overrides` for test doubles
3. **Isolate tests** - Each test should be independent
4. **Use fixtures** - Share setup logic, avoid duplication
5. **Test error cases** - Validate error responses and status codes
6. **Clear overrides** - Reset `dependency_overrides` after tests
7. **Use in-memory DB** - SQLite for speed, or separate test database
