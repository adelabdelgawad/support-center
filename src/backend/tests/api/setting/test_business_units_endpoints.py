"""Tests for business units endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import BusinessUnit, User


class TestBusinessUnitsEndpoints:
    """Test suite for /api/setting/business-units/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_business_units_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/business-units/ with empty database."""
        response = await client.get("/api/setting/business-units/")
        assert response.status_code == 200

        data = response.json()
        assert "businessUnits" in data
        assert "total" in data
        assert "activeCount" in data
        assert "inactiveCount" in data
        assert isinstance(data["businessUnits"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_business_units_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-units/ with existing business units."""
        bu1 = BusinessUnit(name="IT Department", code="IT", is_active=True)
        bu2 = BusinessUnit(name="HR Department", code="HR", is_active=False)
        db_session.add_all([bu1, bu2])
        await db_session.commit()

        response = await client.get("/api/setting/business-units/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["businessUnits"]) == 2
        assert data["total"] == 2
        assert data["activeCount"] == 1
        assert data["inactiveCount"] == 1

        # Verify camelCase fields
        assert "isActive" in data["businessUnits"][0]

    @pytest.mark.asyncio
    async def test_get_business_units_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-units/ pagination."""
        for i in range(5):
            bu = BusinessUnit(name=f"BU {i}", code=f"BU{i}", is_active=True)
            db_session.add(bu)
        await db_session.commit()

        response = await client.get("/api/setting/business-units/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnits"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_business_units_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-units/ with is_active filter."""
        bu1 = BusinessUnit(name="Active BU", code="ACT", is_active=True)
        bu2 = BusinessUnit(name="Inactive BU", code="INACT", is_active=False)
        db_session.add_all([bu1, bu2])
        await db_session.commit()

        response = await client.get("/api/setting/business-units/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnits"]) == 1
        assert data["businessUnits"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_business_units_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-units/ with search."""
        bu1 = BusinessUnit(name="IT Department", code="IT", is_active=True)
        bu2 = BusinessUnit(name="HR Department", code="HR", is_active=True)
        db_session.add_all([bu1, bu2])
        await db_session.commit()

        response = await client.get("/api/setting/business-units/?search=IT")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnits"]) == 1
        assert "IT" in data["businessUnits"][0]["name"]

    @pytest.mark.asyncio
    async def test_get_business_unit_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-units/{bu_id}."""
        bu = BusinessUnit(name="Test BU", code="TEST", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        response = await client.get(f"/api/setting/business-units/{bu.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == bu.id
        assert data["name"] == "Test BU"
        assert data["code"] == "TEST"

    @pytest.mark.asyncio
    async def test_get_business_unit_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/business-units/{bu_id} with non-existent ID."""
        response = await client.get("/api/setting/business-units/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_business_unit(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/business-units/."""
        bu_data = {
            "name": "New BU",
            "code": "NEW",
            "description": "New business unit",
            "isActive": True,
        }

        response = await client.post("/api/setting/business-units/", json=bu_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New BU"
        assert data["code"] == "NEW"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_business_unit_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/business-units/ with invalid data."""
        bu_data = {"name": "Missing code"}

        response = await client.post("/api/setting/business-units/", json=bu_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_business_unit(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/business-units/{bu_id}."""
        bu = BusinessUnit(name="Old Name", code="OLD", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        update_data = {"name": "Updated Name", "code": "UPD", "isActive": False}

        response = await client.put(
            f"/api/setting/business-units/{bu.id}", json=update_data
        )
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["code"] == "UPD"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_business_unit_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/business-units/{bu_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/api/setting/business-units/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_business_unit(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/business-units/{bu_id}."""
        bu = BusinessUnit(name="To Delete", code="DEL", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        response = await client.delete(f"/api/setting/business-units/{bu.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Business unit deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_business_unit_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/business-units/{bu_id} with non-existent ID."""
        response = await client.delete("/api/setting/business-units/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_bulk_update_business_unit_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/business-units/status for bulk status update."""
        bu1 = BusinessUnit(name="BU 1", code="BU1", is_active=True)
        bu2 = BusinessUnit(name="BU 2", code="BU2", is_active=True)
        db_session.add_all([bu1, bu2])
        await db_session.commit()
        await db_session.refresh(bu1)
        await db_session.refresh(bu2)

        bulk_data = {"ids": [bu1.id, bu2.id], "isActive": False}

        response = await client.put("/api/setting/business-units/status", json=bulk_data)
        assert response.status_code == 200

        data = response.json()
        assert "updatedBusinessUnits" in data
        assert len(data["updatedBusinessUnits"]) == 2
        for bu in data["updatedBusinessUnits"]:
            assert bu["isActive"] is False
