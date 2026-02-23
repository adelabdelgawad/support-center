"""Tests for pages endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import Page, User


class TestPagesEndpoints:
    """Test suite for /api/setting/pages/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_pages_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/pages/ with empty database."""
        response = await client.get("/backend/pages/")
        assert response.status_code == 200

        data = response.json()
        assert "pages" in data
        assert "total" in data
        assert "activeCount" in data
        assert "inactiveCount" in data
        assert isinstance(data["pages"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_pages_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/pages/ with existing pages."""
        page1 = Page(title="Dashboard", path="/dashboard", is_active=True)
        page2 = Page(title="Settings", path="/settings", is_active=False)
        db_session.add_all([page1, page2])
        await db_session.commit()

        response = await client.get("/backend/pages/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["pages"]) == 2
        assert data["total"] == 2
        assert data["activeCount"] == 1
        assert data["inactiveCount"] == 1

        # Verify camelCase fields
        assert "isActive" in data["pages"][0]
        assert "parentId" in data["pages"][0] or data["pages"][0].get("parentId") is None

    @pytest.mark.asyncio
    async def test_get_pages_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/pages/ pagination."""
        for i in range(5):
            page = Page(title=f"Page {i}", path=f"/page-{i}", is_active=True)
            db_session.add(page)
        await db_session.commit()

        response = await client.get("/backend/pages/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["pages"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_pages_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/pages/ with is_active filter."""
        page1 = Page(title="Active Page", path="/active", is_active=True)
        page2 = Page(title="Inactive Page", path="/inactive", is_active=False)
        db_session.add_all([page1, page2])
        await db_session.commit()

        response = await client.get("/backend/pages/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["pages"]) == 1
        assert data["pages"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_pages_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/pages/ with search."""
        page1 = Page(title="Dashboard", path="/dashboard", is_active=True)
        page2 = Page(title="Reports", path="/reports", is_active=True)
        db_session.add_all([page1, page2])
        await db_session.commit()

        response = await client.get("/backend/pages/?search=dashboard")
        assert response.status_code == 200
        data = response.json()
        assert len(data["pages"]) == 1
        assert "dashboard" in data["pages"][0]["title"].lower()

    @pytest.mark.asyncio
    async def test_get_page_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/pages/{page_id}."""
        page = Page(title="Test Page", path="/test", is_active=True, icon="test-icon")
        db_session.add(page)
        await db_session.commit()
        await db_session.refresh(page)

        response = await client.get(f"/backend/pages/{page.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == page.id
        assert data["title"] == "Test Page"
        assert data["path"] == "/test"
        assert data["icon"] == "test-icon"

    @pytest.mark.asyncio
    async def test_get_page_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/pages/{page_id} with non-existent ID."""
        response = await client.get("/backend/pages/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_page(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/pages/."""
        page_data = {
            "title": "New Page",
            "path": "/new-page",
            "icon": "new-icon",
            "isActive": True,
        }

        response = await client.post("/backend/pages/", json=page_data)
        assert response.status_code == 200

        data = response.json()
        assert data["title"] == "New Page"
        assert data["path"] == "/new-page"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_page_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/pages/ with invalid data."""
        page_data = {"title": "Missing path"}

        response = await client.post("/backend/pages/", json=page_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_page(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/pages/{page_id}."""
        page = Page(title="Old Title", path="/old", is_active=True)
        db_session.add(page)
        await db_session.commit()
        await db_session.refresh(page)

        update_data = {"title": "Updated Title", "path": "/updated", "isActive": False}

        response = await client.put(f"/backend/pages/{page.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["path"] == "/updated"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_page_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/pages/{page_id} with non-existent ID."""
        update_data = {"title": "Updated"}

        response = await client.put("/backend/pages/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_page(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/pages/{page_id}."""
        page = Page(title="To Delete", path="/delete", is_active=True)
        db_session.add(page)
        await db_session.commit()
        await db_session.refresh(page)

        response = await client.delete(f"/backend/pages/{page.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Page deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_page_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/pages/{page_id} with non-existent ID."""
        response = await client.delete("/backend/pages/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_bulk_update_page_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/pages/status for bulk status update."""
        page1 = Page(title="Page 1", path="/page1", is_active=True)
        page2 = Page(title="Page 2", path="/page2", is_active=True)
        db_session.add_all([page1, page2])
        await db_session.commit()
        await db_session.refresh(page1)
        await db_session.refresh(page2)

        bulk_data = {"ids": [page1.id, page2.id], "isActive": False}

        response = await client.put("/backend/pages/status", json=bulk_data)
        assert response.status_code == 200

        data = response.json()
        assert "updatedPages" in data
        assert len(data["updatedPages"]) == 2
        for page in data["updatedPages"]:
            assert page["isActive"] is False
