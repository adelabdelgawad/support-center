"""Tests for business unit regions endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import BusinessUnit, BusinessUnitRegion, User


class TestBURegionsEndpoints:
    """Test suite for /api/setting/business-unit-regions/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_bu_regions_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/business-unit-regions/ with empty database."""
        response = await client.get("/backend/business-unit-regions/")
        assert response.status_code == 200

        data = response.json()
        assert "businessUnitRegions" in data
        assert "total" in data
        assert isinstance(data["businessUnitRegions"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_bu_regions_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-regions/ with existing regions."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        region1 = BusinessUnitRegion(
            name="North Region",
            business_unit_id=bu.id,
            is_active=True,
        )
        region2 = BusinessUnitRegion(
            name="South Region",
            business_unit_id=bu.id,
            is_active=False,
        )
        db_session.add_all([region1, region2])
        await db_session.commit()

        response = await client.get("/backend/business-unit-regions/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["businessUnitRegions"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["businessUnitRegions"][0]
        assert "businessUnitId" in data["businessUnitRegions"][0]

    @pytest.mark.asyncio
    async def test_get_bu_regions_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-regions/ pagination."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        for i in range(5):
            region = BusinessUnitRegion(
                name=f"Region {i}",
                business_unit_id=bu.id,
                is_active=True,
            )
            db_session.add(region)
        await db_session.commit()

        response = await client.get("/backend/business-unit-regions/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnitRegions"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_bu_regions_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-regions/ with is_active filter."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        region1 = BusinessUnitRegion(name="Active Region", business_unit_id=bu.id, is_active=True)
        region2 = BusinessUnitRegion(name="Inactive Region", business_unit_id=bu.id, is_active=False)
        db_session.add_all([region1, region2])
        await db_session.commit()

        response = await client.get("/backend/business-unit-regions/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnitRegions"]) == 1
        assert data["businessUnitRegions"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_bu_regions_filter_by_business_unit(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-regions/ with business_unit_id filter."""
        bu1 = BusinessUnit(name="IT Department", code="IT", is_active=True)
        bu2 = BusinessUnit(name="HR Department", code="HR", is_active=True)
        db_session.add_all([bu1, bu2])
        await db_session.commit()
        await db_session.refresh(bu1)
        await db_session.refresh(bu2)

        region1 = BusinessUnitRegion(name="IT Region", business_unit_id=bu1.id, is_active=True)
        region2 = BusinessUnitRegion(name="HR Region", business_unit_id=bu2.id, is_active=True)
        db_session.add_all([region1, region2])
        await db_session.commit()

        response = await client.get(f"/backend/business-unit-regions/?business_unit_id={bu1.id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnitRegions"]) == 1
        assert data["businessUnitRegions"][0]["businessUnitId"] == bu1.id

    @pytest.mark.asyncio
    async def test_get_bu_regions_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-regions/ with search."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        region1 = BusinessUnitRegion(name="North Region", business_unit_id=bu.id, is_active=True)
        region2 = BusinessUnitRegion(name="South Region", business_unit_id=bu.id, is_active=True)
        db_session.add_all([region1, region2])
        await db_session.commit()

        response = await client.get("/backend/business-unit-regions/?search=north")
        assert response.status_code == 200
        data = response.json()
        assert len(data["businessUnitRegions"]) == 1
        assert "north" in data["businessUnitRegions"][0]["name"].lower()

    @pytest.mark.asyncio
    async def test_get_bu_region_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/business-unit-regions/{region_id}."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        region = BusinessUnitRegion(name="Test Region", business_unit_id=bu.id, is_active=True)
        db_session.add(region)
        await db_session.commit()
        await db_session.refresh(region)

        response = await client.get(f"/backend/business-unit-regions/{region.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == region.id
        assert data["name"] == "Test Region"
        assert data["businessUnitId"] == bu.id

    @pytest.mark.asyncio
    async def test_get_bu_region_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/business-unit-regions/{region_id} with non-existent ID."""
        response = await client.get("/backend/business-unit-regions/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_bu_region(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test POST /api/setting/business-unit-regions/."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        region_data = {
            "name": "New Region",
            "businessUnitId": bu.id,
            "description": "Test description",
            "isActive": True,
        }

        response = await client.post("/backend/business-unit-regions/", json=region_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New Region"
        assert data["businessUnitId"] == bu.id
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_bu_region_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/business-unit-regions/ with invalid data."""
        region_data = {"name": "Missing business_unit_id"}

        response = await client.post("/backend/business-unit-regions/", json=region_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_bu_region(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/business-unit-regions/{region_id}."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        region = BusinessUnitRegion(name="Old Name", business_unit_id=bu.id, is_active=True)
        db_session.add(region)
        await db_session.commit()
        await db_session.refresh(region)

        update_data = {"name": "Updated Name", "isActive": False}

        response = await client.put(
            f"/backend/business-unit-regions/{region.id}", json=update_data
        )
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_bu_region_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/business-unit-regions/{region_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/backend/business-unit-regions/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_bu_region(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/business-unit-regions/{region_id}."""
        bu = BusinessUnit(name="IT Department", code="IT", is_active=True)
        db_session.add(bu)
        await db_session.commit()
        await db_session.refresh(bu)

        region = BusinessUnitRegion(name="To Delete", business_unit_id=bu.id, is_active=True)
        db_session.add(region)
        await db_session.commit()
        await db_session.refresh(region)

        response = await client.delete(f"/backend/business-unit-regions/{region.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Business unit region deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_bu_region_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/business-unit-regions/{region_id} with non-existent ID."""
        response = await client.delete("/backend/business-unit-regions/99999")
        assert response.status_code == 404
