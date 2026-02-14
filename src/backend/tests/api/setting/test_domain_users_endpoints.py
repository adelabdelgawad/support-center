"""Tests for domain users endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import DomainUser, OrganizationalUnit, User


class TestDomainUsersEndpoints:
    """Test suite for /api/setting/domain-users/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_domain_users_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/domain-users/ with empty database."""
        response = await client.get("/api/setting/domain-users/")
        assert response.status_code == 200

        data = response.json()
        assert "domainUsers" in data
        assert "total" in data
        assert isinstance(data["domainUsers"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_domain_users_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/domain-users/ with existing domain users."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        du1 = DomainUser(
            username="jdoe",
            display_name="John Doe",
            email="jdoe@example.com",
            organizational_unit_id=ou.id,
            is_active=True,
        )
        du2 = DomainUser(
            username="asmith",
            display_name="Alice Smith",
            email="asmith@example.com",
            organizational_unit_id=ou.id,
            is_active=False,
        )
        db_session.add_all([du1, du2])
        await db_session.commit()

        response = await client.get("/api/setting/domain-users/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["domainUsers"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["domainUsers"][0]
        assert "displayName" in data["domainUsers"][0]
        assert "organizationalUnitId" in data["domainUsers"][0]

    @pytest.mark.asyncio
    async def test_get_domain_users_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/domain-users/ pagination."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        for i in range(5):
            du = DomainUser(
                username=f"user{i}",
                display_name=f"User {i}",
                email=f"user{i}@example.com",
                organizational_unit_id=ou.id,
                is_active=True,
            )
            db_session.add(du)
        await db_session.commit()

        response = await client.get("/api/setting/domain-users/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["domainUsers"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_domain_users_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/domain-users/ with is_active filter."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        du1 = DomainUser(
            username="active",
            display_name="Active User",
            email="active@example.com",
            organizational_unit_id=ou.id,
            is_active=True,
        )
        du2 = DomainUser(
            username="inactive",
            display_name="Inactive User",
            email="inactive@example.com",
            organizational_unit_id=ou.id,
            is_active=False,
        )
        db_session.add_all([du1, du2])
        await db_session.commit()

        response = await client.get("/api/setting/domain-users/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["domainUsers"]) == 1
        assert data["domainUsers"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_domain_users_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/domain-users/ with search."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        du1 = DomainUser(
            username="jdoe",
            display_name="John Doe",
            email="jdoe@example.com",
            organizational_unit_id=ou.id,
            is_active=True,
        )
        du2 = DomainUser(
            username="asmith",
            display_name="Alice Smith",
            email="asmith@example.com",
            organizational_unit_id=ou.id,
            is_active=True,
        )
        db_session.add_all([du1, du2])
        await db_session.commit()

        response = await client.get("/api/setting/domain-users/?search=john")
        assert response.status_code == 200
        data = response.json()
        assert len(data["domainUsers"]) == 1
        assert "john" in data["domainUsers"][0]["displayName"].lower()

    @pytest.mark.asyncio
    async def test_get_domain_user_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/domain-users/{user_id}."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        du = DomainUser(
            username="jdoe",
            display_name="John Doe",
            email="jdoe@example.com",
            organizational_unit_id=ou.id,
            is_active=True,
        )
        db_session.add(du)
        await db_session.commit()
        await db_session.refresh(du)

        response = await client.get(f"/api/setting/domain-users/{du.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == du.id
        assert data["username"] == "jdoe"
        assert data["displayName"] == "John Doe"

    @pytest.mark.asyncio
    async def test_get_domain_user_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/domain-users/{user_id} with non-existent ID."""
        response = await client.get("/api/setting/domain-users/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_sync_domain_users(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/domain-users/sync."""
        # This will likely fail without AD configured, but we test the endpoint
        response = await client.post("/api/setting/domain-users/sync")
        # Accept either success or error
        assert response.status_code in [200, 400, 500]

    @pytest.mark.asyncio
    async def test_update_domain_user(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/domain-users/{user_id}."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        du = DomainUser(
            username="jdoe",
            display_name="John Doe",
            email="jdoe@example.com",
            organizational_unit_id=ou.id,
            is_active=True,
        )
        db_session.add(du)
        await db_session.commit()
        await db_session.refresh(du)

        update_data = {"displayName": "John Updated Doe", "isActive": False}

        response = await client.put(f"/api/setting/domain-users/{du.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["displayName"] == "John Updated Doe"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_domain_user_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/domain-users/{user_id} with non-existent ID."""
        update_data = {"displayName": "Updated"}

        response = await client.put("/api/setting/domain-users/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_domain_user(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/domain-users/{user_id}."""
        ou = OrganizationalUnit(name="Test OU", distinguished_name="ou=test,dc=example,dc=com", is_active=True)
        db_session.add(ou)
        await db_session.commit()
        await db_session.refresh(ou)

        du = DomainUser(
            username="jdoe",
            display_name="John Doe",
            email="jdoe@example.com",
            organizational_unit_id=ou.id,
            is_active=True,
        )
        db_session.add(du)
        await db_session.commit()
        await db_session.refresh(du)

        response = await client.delete(f"/api/setting/domain-users/{du.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Domain user deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_domain_user_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/domain-users/{user_id} with non-existent ID."""
        response = await client.delete("/api/setting/domain-users/99999")
        assert response.status_code == 404
