"""Tests for request statuses endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import RequestStatus, User


class TestRequestStatusesEndpoints:
    """Test suite for /api/setting/request-statuses/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_request_statuses_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/request-statuses/ with empty database."""
        response = await client.get("/backend/request-statuses/")
        assert response.status_code == 200

        data = response.json()
        assert "requestStatuses" in data
        assert "total" in data
        assert isinstance(data["requestStatuses"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_request_statuses_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-statuses/ with existing request statuses."""
        rs1 = RequestStatus(name="Open", is_active=True)
        rs2 = RequestStatus(name="Closed", is_active=False)
        db_session.add_all([rs1, rs2])
        await db_session.commit()

        response = await client.get("/backend/request-statuses/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["requestStatuses"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["requestStatuses"][0]

    @pytest.mark.asyncio
    async def test_get_request_statuses_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-statuses/ pagination."""
        for i in range(5):
            rs = RequestStatus(name=f"Status {i}", is_active=True)
            db_session.add(rs)
        await db_session.commit()

        response = await client.get("/backend/request-statuses/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["requestStatuses"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_request_statuses_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-statuses/ with is_active filter."""
        rs1 = RequestStatus(name="Active Status", is_active=True)
        rs2 = RequestStatus(name="Inactive Status", is_active=False)
        db_session.add_all([rs1, rs2])
        await db_session.commit()

        response = await client.get("/backend/request-statuses/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["requestStatuses"]) == 1
        assert data["requestStatuses"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_request_statuses_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-statuses/ with search."""
        rs1 = RequestStatus(name="Open", is_active=True)
        rs2 = RequestStatus(name="In Progress", is_active=True)
        db_session.add_all([rs1, rs2])
        await db_session.commit()

        response = await client.get("/backend/request-statuses/?search=progress")
        assert response.status_code == 200
        data = response.json()
        assert len(data["requestStatuses"]) == 1
        assert "progress" in data["requestStatuses"][0]["name"].lower()

    @pytest.mark.asyncio
    async def test_get_request_status_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/request-statuses/{status_id}."""
        rs = RequestStatus(name="Test Status", is_active=True, description="Test desc")
        db_session.add(rs)
        await db_session.commit()
        await db_session.refresh(rs)

        response = await client.get(f"/backend/request-statuses/{rs.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == rs.id
        assert data["name"] == "Test Status"
        assert data["description"] == "Test desc"

    @pytest.mark.asyncio
    async def test_get_request_status_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/request-statuses/{status_id} with non-existent ID."""
        response = await client.get("/backend/request-statuses/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_request_status(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/request-statuses/."""
        rs_data = {
            "name": "New Status",
            "description": "Test description",
            "isActive": True,
        }

        response = await client.post("/backend/request-statuses/", json=rs_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New Status"
        assert data["description"] == "Test description"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_request_status_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/request-statuses/ with invalid data."""
        rs_data = {"description": "Missing name"}

        response = await client.post("/backend/request-statuses/", json=rs_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_request_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/request-statuses/{status_id}."""
        rs = RequestStatus(name="Old Name", is_active=True)
        db_session.add(rs)
        await db_session.commit()
        await db_session.refresh(rs)

        update_data = {"name": "Updated Name", "isActive": False}

        response = await client.put(
            f"/backend/request-statuses/{rs.id}", json=update_data
        )
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_request_status_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/request-statuses/{status_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/backend/request-statuses/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_request_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/request-statuses/{status_id}."""
        rs = RequestStatus(name="To Delete", is_active=True)
        db_session.add(rs)
        await db_session.commit()
        await db_session.refresh(rs)

        response = await client.delete(f"/backend/request-statuses/{rs.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Request status deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_request_status_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/request-statuses/{status_id} with non-existent ID."""
        response = await client.delete("/backend/request-statuses/99999")
        assert response.status_code == 404
