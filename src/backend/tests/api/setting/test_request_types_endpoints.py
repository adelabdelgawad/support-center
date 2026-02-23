"""Tests for request types endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import RequestType, User


class TestRequestTypesEndpoints:
    """Test suite for /api/setting/request-types/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_request_types_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/request-types/ with empty database."""
        response = await client.get("/backend/request-types/")
        assert response.status_code == 200

        data = response.json()
        assert "requestTypes" in data
        assert "total" in data
        assert isinstance(data["requestTypes"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_request_types_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-types/ with existing request types."""
        rt1 = RequestType(name="Incident", is_active=True)
        rt2 = RequestType(name="Service Request", is_active=False)
        db_session.add_all([rt1, rt2])
        await db_session.commit()

        response = await client.get("/backend/request-types/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["requestTypes"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["requestTypes"][0]

    @pytest.mark.asyncio
    async def test_get_request_types_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-types/ pagination."""
        for i in range(5):
            rt = RequestType(name=f"Type {i}", is_active=True)
            db_session.add(rt)
        await db_session.commit()

        response = await client.get("/backend/request-types/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["requestTypes"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_request_types_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-types/ with is_active filter."""
        rt1 = RequestType(name="Active Type", is_active=True)
        rt2 = RequestType(name="Inactive Type", is_active=False)
        db_session.add_all([rt1, rt2])
        await db_session.commit()

        response = await client.get("/backend/request-types/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["requestTypes"]) == 1
        assert data["requestTypes"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_request_types_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-types/ with search."""
        rt1 = RequestType(name="Incident", is_active=True)
        rt2 = RequestType(name="Change Request", is_active=True)
        db_session.add_all([rt1, rt2])
        await db_session.commit()

        response = await client.get("/backend/request-types/?search=incident")
        assert response.status_code == 200
        data = response.json()
        assert len(data["requestTypes"]) == 1
        assert "incident" in data["requestTypes"][0]["name"].lower()

    @pytest.mark.asyncio
    async def test_get_request_type_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-types/{type_id}."""
        rt = RequestType(name="Test Type", is_active=True, description="Test desc")
        db_session.add(rt)
        await db_session.commit()
        await db_session.refresh(rt)

        response = await client.get(f"/backend/request-types/{rt.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == rt.id
        assert data["name"] == "Test Type"
        assert data["description"] == "Test desc"

    @pytest.mark.asyncio
    async def test_get_request_type_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/request-types/{type_id} with non-existent ID."""
        response = await client.get("/backend/request-types/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_request_type(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/request-types/."""
        rt_data = {
            "name": "New Type",
            "description": "Test description",
            "isActive": True,
        }

        response = await client.post("/backend/request-types/", json=rt_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New Type"
        assert data["description"] == "Test description"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_request_type_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/request-types/ with invalid data."""
        rt_data = {"description": "Missing name"}

        response = await client.post("/backend/request-types/", json=rt_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_request_type(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/request-types/{type_id}."""
        rt = RequestType(name="Old Name", is_active=True)
        db_session.add(rt)
        await db_session.commit()
        await db_session.refresh(rt)

        update_data = {"name": "Updated Name", "isActive": False}

        response = await client.put(f"/backend/request-types/{rt.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_request_type_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/request-types/{type_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/backend/request-types/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_request_type(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/request-types/{type_id}."""
        rt = RequestType(name="To Delete", is_active=True)
        db_session.add(rt)
        await db_session.commit()
        await db_session.refresh(rt)

        response = await client.delete(f"/backend/request-types/{rt.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Request type deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_request_type_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/request-types/{type_id} with non-existent ID."""
        response = await client.delete("/backend/request-types/99999")
        assert response.status_code == 404
