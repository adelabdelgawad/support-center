"""Tests for organizational units endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import OrganizationalUnit, User


class TestOrgUnitsEndpoints:
    """Test suite for /api/setting/organizational-units/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_org_units_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/organizational-units/ with empty database."""
        response = await client.get("/api/setting/organizational-units/")
        assert response.status_code == 200

        data = response.json()
        assert "organizationalUnits" in data
        assert "total" in data
        assert isinstance(data["organizationalUnits"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_org_units_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/organizational-units/ with existing OUs."""
        ou1 = OrganizationalUnit(name="IT Department", distinguished_name="ou=it,dc=example,dc=com", is_active=True)
        ou2 = OrganizationalUnit(name="HR Department", distinguished_name="ou=hr,dc=example,dc=com", is_active=False)
        db_session.add_all([ou1, ou2])
        await db_session.commit()

        response = await client.get("/api/setting/organizational-units/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["organizationalUnits"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["organizationalUnits"][0]
        assert "distinguishedName" in data["organizationalUnits"][0]

    @pytest.mark.asyncio
    async def test_get_org_units_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/organizational-units/ pagination."""
        for i in range(5):
            ou = OrganizationalUnit(name=f"OU {i}", distinguished_name=f"ou=ou{i},dc=example,dc=com", is_active=True)
            db_session.add(ou)
        await db_session.commit()

        response = await client.get("/api/setting/organizational-units/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["organizationalUnits"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_org_units_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/organizational-units/ with is_active filter."""
        ou1 = OrganizationalUnit(name="Active OU", distinguished_name="ou=active,dc=example,dc=com", is_active=True)
        ou2 = OrganizationalUnit(name="Inactive OU", distinguished_name="ou=inactive,dc=example,dc=com", is_active=False)
        db_session.add_all([ou1, ou2])
        await db_session.commit()

        response = await client.get("/api/setting/organizational-units/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["organizationalUnits"]) == 1
        assert data["organizationalUnits"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_org_units_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/organizational-units/ with search."""
        ou1 = OrganizationalUnit(name="IT Department", distinguished_name="ou=it,dc=example,dc=com", is_active=True)
        ou2 = OrganizationalUnit(name="HR Department", distinguished_name="ou=hr,dc=example,dc=com", is_active=True)
        db_session.add_all([ou1, ou2])
        await db_session.commit()

        response = await client.get("/api/setting/organizational-units/?search=IT")
        assert response.status_code == 200
        data = response.json()
        assert len(data["organizationalUnits"]) == 1
        assert "IT" in data["organizationalUnits"][0]["name"]

    @pytest.mark.asyncio
    async def test_get_org_unit_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/organizational-units/{ou_id}."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        response = await client.get(f"/api/setting/organizational-units/{ou.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == ou.id
        assert data["name"] == "Test OU"
        assert data["distinguishedName"] == "ou=test,dc=example,dc=com"

    @pytest.mark.asyncio
    async def test_get_org_unit_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/organizational-units/{ou_id} with non-existent ID."""
        response = await client.get("/api/setting/organizational-units/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_org_unit(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/organizational-units/."""
        ou_data = {
            "name": "New OU",
            "distinguishedName": "ou=new,dc=example,dc=com",
            "description": "Test description",
            "isActive": True,
        }

        response = await client.post("/api/setting/organizational-units/", json=ou_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New OU"
        assert data["distinguishedName"] == "ou=new,dc=example,dc=com"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_org_unit_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/organizational-units/ with invalid data."""
        ou_data = {"name": "Missing DN"}

        response = await client.post("/api/setting/organizational-units/", json=ou_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_org_unit(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/organizational-units/{ou_id}."""
        ou = OrganizationalUnit(name="Old Name", distinguished_name="ou=old,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        update_data = {"name": "Updated Name", "isActive": False}

        response = await client.put(f"/api/setting/organizational-units/{ou.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_org_unit_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/organizational-units/{ou_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/api/setting/organizational-units/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_org_unit(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/organizational-units/{ou_id}."""
        ou = OrganizationalUnit(name="To Delete", distinguished_name="ou=delete,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        response = await client.delete(f"/api/setting/organizational-units/{ou.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Organizational unit deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_org_unit_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/organizational-units/{ou_id} with non-existent ID."""
        response = await client.delete("/api/setting/organizational-units/99999")
        assert response.status_code == 404
