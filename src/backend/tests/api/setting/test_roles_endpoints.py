"""Tests for roles endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import Role, User


class TestRolesEndpoints:
    """Test suite for /api/setting/roles/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_roles_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/roles/ with empty database."""
        response = await client.get("/backend/roles/")
        assert response.status_code == 200

        data = response.json()
        assert "roles" in data
        assert "total" in data
        assert "activeCount" in data
        assert "inactiveCount" in data
        assert isinstance(data["roles"], list)
        assert data["total"] == 0
        assert data["activeCount"] == 0
        assert data["inactiveCount"] == 0

    @pytest.mark.asyncio
    async def test_get_roles_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/roles/ with existing roles."""
        # Create test roles
        role1 = Role(name="Test Role 1", is_active=True)
        role2 = Role(name="Test Role 2", is_active=False)
        db_session.add_all([role1, role2])
        await db_session.commit()

        response = await client.get("/backend/roles/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["roles"]) == 2
        assert data["total"] == 2
        assert data["activeCount"] == 1
        assert data["inactiveCount"] == 1

        # Verify camelCase fields
        assert "isActive" in data["roles"][0]
        assert "createdAt" in data["roles"][0]

    @pytest.mark.asyncio
    async def test_get_roles_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/roles/ pagination."""
        # Create 5 roles
        for i in range(5):
            role = Role(name=f"Role {i}", is_active=True)
            db_session.add(role)
        await db_session.commit()

        # Get first page
        response = await client.get("/backend/roles/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["roles"]) == 2
        assert data["total"] == 5

        # Get second page
        response = await client.get("/backend/roles/?limit=2&skip=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["roles"]) == 2

    @pytest.mark.asyncio
    async def test_get_roles_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/roles/ with is_active filter."""
        role1 = Role(name="Active Role", is_active=True)
        role2 = Role(name="Inactive Role", is_active=False)
        db_session.add_all([role1, role2])
        await db_session.commit()

        # Filter active
        response = await client.get("/backend/roles/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["roles"]) == 1
        assert data["roles"][0]["isActive"] is True

        # Filter inactive
        response = await client.get("/backend/roles/?is_active=false")
        assert response.status_code == 200
        data = response.json()
        assert len(data["roles"]) == 1
        assert data["roles"][0]["isActive"] is False

    @pytest.mark.asyncio
    async def test_get_roles_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/roles/ with search."""
        role1 = Role(name="Administrator", is_active=True)
        role2 = Role(name="Support Agent", is_active=True)
        db_session.add_all([role1, role2])
        await db_session.commit()

        response = await client.get("/backend/roles/?search=admin")
        assert response.status_code == 200
        data = response.json()
        assert len(data["roles"]) == 1
        assert "admin" in data["roles"][0]["name"].lower()

    @pytest.mark.asyncio
    async def test_get_role_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/roles/{role_id}."""
        role = Role(name="Test Role", is_active=True, description="Test description")
        db_session.add(role)
        await db_session.commit()
        await db_session.refresh(role)

        response = await client.get(f"/backend/roles/{role.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == role.id
        assert data["name"] == "Test Role"
        assert data["description"] == "Test description"
        assert "isActive" in data

    @pytest.mark.asyncio
    async def test_get_role_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/roles/{role_id} with non-existent ID."""
        response = await client.get("/backend/roles/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_role(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/roles/."""
        role_data = {
            "name": "New Role",
            "description": "New role description",
            "isActive": True,
        }

        response = await client.post("/backend/roles/", json=role_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "New Role"
        assert data["description"] == "New role description"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_role_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/roles/ with invalid data."""
        role_data = {"description": "Missing name field"}

        response = await client.post("/backend/roles/", json=role_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_role(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/roles/{role_id}."""
        role = Role(name="Old Name", description="Old desc", is_active=True)
        db_session.add(role)
        await db_session.commit()
        await db_session.refresh(role)

        update_data = {
            "name": "Updated Name",
            "description": "Updated description",
            "isActive": False,
        }

        response = await client.put(f"/backend/roles/{role.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_role_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/roles/{role_id} with non-existent ID."""
        update_data = {"name": "Updated"}

        response = await client.put("/backend/roles/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_role(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/roles/{role_id}."""
        role = Role(name="To Delete", is_active=True)
        db_session.add(role)
        await db_session.commit()
        await db_session.refresh(role)

        response = await client.delete(f"/backend/roles/{role.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Role deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_role_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/roles/{role_id} with non-existent ID."""
        response = await client.delete("/backend/roles/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_bulk_update_role_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/roles/status for bulk status update."""
        role1 = Role(name="Role 1", is_active=True)
        role2 = Role(name="Role 2", is_active=True)
        db_session.add_all([role1, role2])
        await db_session.commit()
        await db_session.refresh(role1)
        await db_session.refresh(role2)

        bulk_data = {"ids": [role1.id, role2.id], "isActive": False}

        response = await client.put("/backend/roles/status", json=bulk_data)
        assert response.status_code == 200

        data = response.json()
        assert "updatedRoles" in data
        assert len(data["updatedRoles"]) == 2
        for role in data["updatedRoles"]:
            assert role["isActive"] is False
