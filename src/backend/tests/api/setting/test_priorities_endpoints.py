"""Tests for priorities endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import Priority, User


class TestPrioritiesEndpoints:
    """Test suite for /api/setting/priorities/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_priorities_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/priorities/ with empty database."""
        response = await client.get("/api/setting/priorities/")
        assert response.status_code == 200

        data = response.json()
        assert "priorities" in data
        assert "total" in data
        assert isinstance(data["priorities"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_priorities_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/priorities/ with existing priorities."""
        p1 = Priority(name="High", level=1, is_active=True)
        p2 = Priority(name="Low", level=3, is_active=False)
        db_session.add_all([p1, p2])
        await db_session.commit()

        response = await client.get("/api/setting/priorities/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["priorities"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["priorities"][0]

    @pytest.mark.asyncio
    async def test_get_priorities_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/priorities/ pagination."""
        for i in range(5):
            p = Priority(name=f"Priority {i}", level=i, is_active=True)
            db_session.add(p)
        await db_session.commit()

        response = await client.get("/api/setting/priorities/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["priorities"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_priorities_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/priorities/ with is_active filter."""
        p1 = Priority(name="Active Priority", level=1, is_active=True)
        p2 = Priority(name="Inactive Priority", level=2, is_active=False)
        db_session.add_all([p1, p2])
        await db_session.commit()

        response = await client.get("/api/setting/priorities/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["priorities"]) == 1
        assert data["priorities"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_priorities_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/priorities/ with search."""
        p1 = Priority(name="Critical", level=1, is_active=True)
        p2 = Priority(name="Normal", level=2, is_active=True)
        db_session.add_all([p1, p2])
        await db_session.commit()

        response = await client.get("/api/setting/priorities/?search=critical")
        assert response.status_code == 200
        data = response.json()
        assert len(data["priorities"]) == 1
        assert "critical" in data["priorities"][0]["name"].lower()

    @pytest.mark.asyncio
    async def test_get_priority_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/priorities/{priority_id}."""
        p = Priority(name="Test Priority", level=2, is_active=True)
        db_session.add(p)
        await db_session.commit()
        await db_session.refresh(p)

        response = await client.get(f"/api/setting/priorities/{p.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == p.id
        assert data["name"] == "Test Priority"
        assert data["level"] == 2

    @pytest.mark.asyncio
    async def test_get_priority_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/priorities/{priority_id} with non-existent ID."""
        response = await client.get("/api/setting/priorities/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_priority(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/priorities/."""
        priority_data = {
            "name": "New Priority",
            "level": 1,
            "description": "Test description",
            "isActive": True,
        }

        response = await client.post("/api/setting/priorities/", json=priority_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New Priority"
        assert data["level"] == 1
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_priority_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/priorities/ with invalid data."""
        priority_data = {"name": "Missing level"}

        response = await client.post("/api/setting/priorities/", json=priority_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_priority(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/priorities/{priority_id}."""
        p = Priority(name="Old Name", level=1, is_active=True)
        db_session.add(p)
        await db_session.commit()
        await db_session.refresh(p)

        update_data = {"name": "Updated Name", "level": 2, "isActive": False}

        response = await client.put(f"/api/setting/priorities/{p.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["level"] == 2
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_priority_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/priorities/{priority_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/api/setting/priorities/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_priority(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/priorities/{priority_id}."""
        p = Priority(name="To Delete", level=1, is_active=True)
        db_session.add(p)
        await db_session.commit()
        await db_session.refresh(p)

        response = await client.delete(f"/api/setting/priorities/{p.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Priority deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_priority_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/priorities/{priority_id} with non-existent ID."""
        response = await client.delete("/api/setting/priorities/99999")
        assert response.status_code == 404
