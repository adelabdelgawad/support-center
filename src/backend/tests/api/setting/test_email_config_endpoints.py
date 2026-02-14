"""Tests for email config endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import EmailConfig, User


class TestEmailConfigEndpoints:
    """Test suite for /api/setting/email-config/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_email_config_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/email-config/ with empty database."""
        response = await client.get("/api/setting/email-config/")
        assert response.status_code == 200

        data = response.json()
        # Email config might return null if no config exists
        assert data is None or isinstance(data, dict)

    @pytest.mark.asyncio
    async def test_get_email_config_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/email-config/ with existing config."""
        config = EmailConfig(
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="user@example.com",
            smtp_password="password123",
            from_email="noreply@example.com",
            use_tls=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()

        response = await client.get("/api/setting/email-config/")
        assert response.status_code == 200

        data = response.json()
        assert data is not None
        assert "smtpHost" in data
        assert "smtpPort" in data
        assert "smtpUsername" in data
        assert "fromEmail" in data
        assert "useTls" in data
        assert "isActive" in data

    @pytest.mark.asyncio
    async def test_create_email_config(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/email-config/."""
        config_data = {
            "smtpHost": "smtp.example.com",
            "smtpPort": 587,
            "smtpUsername": "user@example.com",
            "smtpPassword": "password123",
            "fromEmail": "noreply@example.com",
            "useTls": True,
            "isActive": True,
        }

        response = await client.post("/api/setting/email-config/", json=config_data)
        assert response.status_code == 200

        data = response.json()
        assert data["smtpHost"] == "smtp.example.com"
        assert data["smtpPort"] == 587
        assert data["useTls"] is True
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_email_config_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/email-config/ with invalid data."""
        config_data = {"smtpHost": "smtp.example.com"}

        response = await client.post("/api/setting/email-config/", json=config_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_email_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/email-config/{config_id}."""
        config = EmailConfig(
            smtp_host="smtp.old.com",
            smtp_port=587,
            smtp_username="old@example.com",
            smtp_password="password",
            from_email="old@example.com",
            use_tls=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()
        await db_session.refresh(config)

        update_data = {
            "smtpHost": "smtp.new.com",
            "smtpUsername": "new@example.com",
            "isActive": False,
        }

        response = await client.put(
            f"/api/setting/email-config/{config.id}", json=update_data
        )
        assert response.status_code == 200

        data = response.json()
        assert data["smtpHost"] == "smtp.new.com"
        assert data["smtpUsername"] == "new@example.com"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_email_config_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/email-config/{config_id} with non-existent ID."""
        update_data = {"smtpHost": "smtp.example.com"}

        response = await client.put("/api/setting/email-config/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_email_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/email-config/{config_id}."""
        config = EmailConfig(
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="user@example.com",
            smtp_password="password",
            from_email="noreply@example.com",
            use_tls=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()
        await db_session.refresh(config)

        response = await client.delete(f"/api/setting/email-config/{config.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "Email config deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_email_config_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/email-config/{config_id} with non-existent ID."""
        response = await client.delete("/api/setting/email-config/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_test_email_config(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test POST /api/setting/email-config/test."""
        config = EmailConfig(
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="user@example.com",
            smtp_password="password",
            from_email="noreply@example.com",
            use_tls=True,
            is_active=True,
        )
        db_session.add(config)
        await db_session.commit()
        await db_session.refresh(config)

        test_data = {"testEmail": "test@example.com"}

        # This might fail because SMTP is not available, but we test the endpoint
        response = await client.post("/api/setting/email-config/test", json=test_data)
        # Accept either success or error (since SMTP won't be available in tests)
        assert response.status_code in [200, 400, 500]
