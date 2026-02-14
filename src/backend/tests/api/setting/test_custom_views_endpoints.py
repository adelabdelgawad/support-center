"""Tests for custom views endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import User, UserCustomView


class TestCustomViewsEndpoints:
    """Test suite for /api/setting/user-custom-views/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_custom_views_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/user-custom-views/ with empty database."""
        response = await client.get("/api/setting/user-custom-views/")
        assert response.status_code == 200

        data = response.json()
        assert "userCustomViews" in data
        assert "total" in data
        assert isinstance(data["userCustomViews"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_custom_views_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/user-custom-views/ with existing views."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        view1 = UserCustomView(
            user_id=user.id,
            view_name="My Requests",
            view_type="requests",
            filters={"status": "open"},
            is_active=True,
        )
        view2 = UserCustomView(
            user_id=user.id,
            view_name="Closed Requests",
            view_type="requests",
            filters={"status": "closed"},
            is_active=False,
        )
        db_session.add_all([view1, view2])
        await db_session.commit()

        response = await client.get("/api/setting/user-custom-views/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["userCustomViews"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["userCustomViews"][0]
        assert "userId" in data["userCustomViews"][0]
        assert "viewName" in data["userCustomViews"][0]
        assert "viewType" in data["userCustomViews"][0]

    @pytest.mark.asyncio
    async def test_get_custom_views_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/user-custom-views/ pagination."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        for i in range(5):
            view = UserCustomView(
                user_id=user.id,
                view_name=f"View {i}",
                view_type="requests",
                filters={},
                is_active=True,
            )
            db_session.add(view)
        await db_session.commit()

        response = await client.get("/api/setting/user-custom-views/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["userCustomViews"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_custom_views_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/user-custom-views/ with is_active filter."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        view1 = UserCustomView(user_id=user.id, view_name="Active View", view_type="requests", filters={}, is_active=True)
        view2 = UserCustomView(user_id=user.id, view_name="Inactive View", view_type="requests", filters={}, is_active=False)
        db_session.add_all([view1, view2])
        await db_session.commit()

        response = await client.get("/api/setting/user-custom-views/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["userCustomViews"]) == 1
        assert data["userCustomViews"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_custom_views_filter_by_user(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/user-custom-views/ with user_id filter."""
        user1 = User(
            username="user1",
            email="user1@example.com",
            first_name="User",
            last_name="One",
            hashed_password="hashedpassword",
            is_active=True,
        )
        user2 = User(
            username="user2",
            email="user2@example.com",
            first_name="User",
            last_name="Two",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add_all([user1, user2])
        await db_session.commit()
        await db_session.refresh(user1)
        await db_session.refresh(user2)

        view1 = UserCustomView(user_id=user1.id, view_name="View 1", view_type="requests", filters={}, is_active=True)
        view2 = UserCustomView(user_id=user2.id, view_name="View 2", view_type="requests", filters={}, is_active=True)
        db_session.add_all([view1, view2])
        await db_session.commit()

        response = await client.get(f"/api/setting/user-custom-views/?user_id={user1.id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data["userCustomViews"]) == 1
        assert data["userCustomViews"][0]["userId"] == str(user1.id)

    @pytest.mark.asyncio
    async def test_get_custom_views_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/user-custom-views/ with search."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        view1 = UserCustomView(user_id=user.id, view_name="My Requests", view_type="requests", filters={}, is_active=True)
        view2 = UserCustomView(user_id=user.id, view_name="All Requests", view_type="requests", filters={}, is_active=True)
        db_session.add_all([view1, view2])
        await db_session.commit()

        response = await client.get("/api/setting/user-custom-views/?search=My")
        assert response.status_code == 200
        data = response.json()
        assert len(data["userCustomViews"]) == 1
        assert "My" in data["userCustomViews"][0]["viewName"]

    @pytest.mark.asyncio
    async def test_get_custom_view_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/user-custom-views/{view_id}."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        view = UserCustomView(
            user_id=user.id,
            view_name="Test View",
            view_type="requests",
            filters={"status": "open"},
            is_active=True,
        )
        db_session.add(view)
        await db_session.commit()
        await db_session.refresh(view)

        response = await client.get(f"/api/setting/user-custom-views/{view.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == view.id
        assert data["viewName"] == "Test View"
        assert data["viewType"] == "requests"

    @pytest.mark.asyncio
    async def test_get_custom_view_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/user-custom-views/{view_id} with non-existent ID."""
        response = await client.get("/api/setting/user-custom-views/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_custom_view(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test POST /api/setting/user-custom-views/."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        view_data = {
            "userId": str(user.id),
            "viewName": "New View",
            "viewType": "requests",
            "filters": {"status": "open"},
            "isActive": True,
        }

        response = await client.post("/api/setting/user-custom-views/", json=view_data)
        assert response.status_code == 200

        data = response.json()
        assert data["viewName"] == "New View"
        assert data["viewType"] == "requests"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_custom_view_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/user-custom-views/ with invalid data."""
        view_data = {"viewName": "Missing required fields"}

        response = await client.post("/api/setting/user-custom-views/", json=view_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_custom_view(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/user-custom-views/{view_id}."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        view = UserCustomView(
            user_id=user.id,
            view_name="Old Name",
            view_type="requests",
            filters={},
            is_active=True,
        )
        db_session.add(view)
        await db_session.commit()
        await db_session.refresh(view)

        update_data = {
            "viewName": "Updated Name",
            "filters": {"status": "closed"},
            "isActive": False,
        }

        response = await client.put(f"/api/setting/user-custom-views/{view.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["viewName"] == "Updated Name"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_custom_view_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/user-custom-views/{view_id} with non-existent ID."""
        update_data = {"viewName": "Updated"}

        response = await client.put("/api/setting/user-custom-views/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_custom_view(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/user-custom-views/{view_id}."""
        user = User(
            username="testuser",
            email="testuser@example.com",
            first_name="Test",
            last_name="User",
            hashed_password="hashedpassword",
            is_active=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        view = UserCustomView(
            user_id=user.id,
            view_name="To Delete",
            view_type="requests",
            filters={},
            is_active=True,
        )
        db_session.add(view)
        await db_session.commit()
        await db_session.refresh(view)

        response = await client.delete(f"/api/setting/user-custom-views/{view.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "User custom view deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_custom_view_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/user-custom-views/{view_id} with non-existent ID."""
        response = await client.delete("/api/setting/user-custom-views/99999")
        assert response.status_code == 404
