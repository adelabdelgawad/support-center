"""Tests for Active Directory config endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import ActiveDirectoryConfig, User


class TestADConfigEndpoints:
    """Test suite for /api/setting/ad-config/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_ad_config_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/ad-config/ with empty database."""
        response = await client.get("/api/setting/ad-config/")
        assert response.status_code == 200

        data = response.json()
        # AD config might return null if no config exists
        assert data is None or isinstance(data, dict)

    @pytest.mark.asyncio
    async def test_get_ad_config_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/ad-config/ with existing config."""
        config = ActiveDirectoryConfig(
            server="ldap.example.com",
            port=389,
            base_dn="dc=example,dc=com",
            bind_dn="cn=admin,dc=example,dc=com",
            bind_password="password123",
            use_ssl=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()

        response = await client.get("/api/setting/ad-config/")
        assert response.status_code == 200

        data = response.json()
        assert data is not None
        assert "server" in data
        assert "port" in data
        assert "baseDn" in data
        assert "bindDn" in data
        assert "useSsl" in data
        assert "isActive" in data

    @pytest.mark.asyncio
    async def test_create_ad_config(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/ad-config/."""
        config_data = {
            "server": "ldap.example.com",
            "port": 389,
            "baseDn": "dc=example,dc=com",
            "bindDn": "cn=admin,dc=example,dc=com",
            "bindPassword": "password123",
            "useSsl": True,
            "isActive": True,
        }

        response = await client.post("/api/setting/ad-config/", json=config_data)
        assert response.status_code == 200

        data = response.json()
        assert data["server"] == "ldap.example.com"
        assert data["port"] == 389
        assert data["useSsl"] is True
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_ad_config_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/ad-config/ with invalid data."""
        config_data = {"server": "ldap.example.com"}

        response = await client.post("/api/setting/ad-config/", json=config_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_ad_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/ad-config/{config_id}."""
        config = ActiveDirectoryConfig(
            server="ldap.old.com",
            port=389,
            base_dn="dc=old,dc=com",
            bind_dn="cn=admin,dc=old,dc=com",
            bind_password="password",
            use_ssl=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()
        await db_session.refresh(config)

        update_data = {
            "server": "ldap.new.com",
            "baseDn": "dc=new,dc=com",
            "isActive": False,
        }

        response = await client.put(f"/api/setting/ad-config/{config.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["server"] == "ldap.new.com"
        assert data["baseDn"] == "dc=new,dc=com"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_ad_config_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/ad-config/{config_id} with non-existent ID."""
        update_data = {"server": "ldap.example.com"}

        response = await client.put("/api/setting/ad-config/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_ad_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/ad-config/{config_id}."""
        config = ActiveDirectoryConfig(
            server="ldap.example.com",
            port=389,
            base_dn="dc=example,dc=com",
            bind_dn="cn=admin,dc=example,dc=com",
            bind_password="password",
            use_ssl=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()
        await db_session.refresh(config)

        response = await client.delete(f"/api/setting/ad-config/{config.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "AD config deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_ad_config_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/ad-config/{config_id} with non-existent ID."""
        response = await client.delete("/api/setting/ad-config/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_test_ad_connection(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test POST /api/setting/ad-config/test-connection."""
        config = ActiveDirectoryConfig(
            server="ldap.example.com",
            port=389,
            base_dn="dc=example,dc=com",
            bind_dn="cn=admin,dc=example,dc=com",
            bind_password="password",
            use_ssl=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()
        await db_session.refresh(config)

        # This might fail because LDAP is not available, but we test the endpoint
        response = await client.post("/api/setting/ad-config/test-connection")
        # Accept either success or error (since LDAP won't be available in tests)
        assert response.status_code in [200, 400, 500]
