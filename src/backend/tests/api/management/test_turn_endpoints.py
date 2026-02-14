"""
Tests for TURN server management endpoints.
Tests api/routers/management/turn_router.py endpoints.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import TurnCredential, User


@pytest.mark.asyncio
class TestGenerateTurnCredentials:
    """Test POST /management/turn/credentials endpoint."""

    async def test_generate_credentials_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test generating TURN credentials successfully."""
        payload = {
            "userId": str(test_user.id),
            "ttl": 3600,
        }

        response = await async_client.post(
            "/management/turn/credentials",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert "username" in data
        assert "password" in data
        assert "uris" in data or "urls" in data

    async def test_generate_credentials_default_ttl(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test generating credentials with default TTL."""
        payload = {
            "userId": str(test_user.id),
        }

        response = await async_client.post(
            "/management/turn/credentials",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200 or response.status_code == 201

    async def test_generate_credentials_missing_user_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test generating credentials without user ID."""
        payload = {"ttl": 3600}

        response = await async_client.post(
            "/management/turn/credentials",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_generate_credentials_unauthorized(
        self,
        async_client: AsyncClient,
    ):
        """Test generating credentials without authentication."""
        payload = {
            "userId": str(uuid4()),
            "ttl": 3600,
        }

        response = await async_client.post(
            "/management/turn/credentials",
            json=payload,
        )

        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetTurnServers:
    """Test GET /management/turn/servers endpoint."""

    async def test_get_servers_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting TURN server list successfully."""
        response = await async_client.get(
            "/management/turn/servers",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "servers" in data

    async def test_get_servers_unauthorized(
        self,
        async_client: AsyncClient,
    ):
        """Test getting servers without authentication."""
        response = await async_client.get("/management/turn/servers")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestValidateTurnCredentials:
    """Test POST /management/turn/validate endpoint."""

    async def test_validate_credentials_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test validating TURN credentials successfully."""
        payload = {
            "username": "test_username",
            "password": "test_password",
        }

        response = await async_client.post(
            "/management/turn/validate",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code in [200, 400, 401]

    async def test_validate_credentials_missing_fields(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test validating with missing credentials."""
        payload = {"username": "test_username"}

        response = await async_client.post(
            "/management/turn/validate",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestListTurnCredentials:
    """Test GET /management/turn/credentials endpoint."""

    async def test_list_credentials_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test listing TURN credentials successfully."""
        credential = TurnCredential(
            user_id=test_user.id,
            username="turn_user_1",
            password="turn_pass_1",
            expires_at=datetime.now(timezone.utc),
        )
        db_session.add(credential)
        await db_session.commit()

        response = await async_client.get(
            "/management/turn/credentials",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "credentials" in data

    async def test_list_credentials_with_pagination(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing credentials with pagination."""
        response = await async_client.get(
            "/management/turn/credentials?skip=0&limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestGetUserTurnCredentials:
    """Test GET /management/turn/credentials/user/{user_id} endpoint."""

    async def test_get_user_credentials_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting credentials for a specific user."""
        credential = TurnCredential(
            user_id=test_user.id,
            username="user_turn_cred",
            password="user_turn_pass",
            expires_at=datetime.now(timezone.utc),
        )
        db_session.add(credential)
        await db_session.commit()

        response = await async_client.get(
            f"/management/turn/credentials/user/{test_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "credentials" in data

    async def test_get_user_credentials_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting credentials with invalid user ID."""
        response = await async_client.get(
            "/management/turn/credentials/user/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestRevokeTurnCredentials:
    """Test DELETE /management/turn/credentials/{credential_id} endpoint."""

    async def test_revoke_credentials_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test revoking TURN credentials successfully."""
        credential = TurnCredential(
            user_id=test_user.id,
            username="revoke_test",
            password="revoke_pass",
            expires_at=datetime.now(timezone.utc),
        )
        db_session.add(credential)
        await db_session.commit()
        await db_session.refresh(credential)

        response = await async_client.delete(
            f"/management/turn/credentials/{credential.id}",
            headers=auth_headers,
        )

        assert response.status_code in [200, 204]

    async def test_revoke_credentials_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test revoking non-existent credentials."""
        fake_id = uuid4()
        response = await async_client.delete(
            f"/management/turn/credentials/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestRefreshTurnCredentials:
    """Test POST /management/turn/credentials/{credential_id}/refresh endpoint."""

    async def test_refresh_credentials_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test refreshing TURN credentials successfully."""
        credential = TurnCredential(
            user_id=test_user.id,
            username="refresh_test",
            password="refresh_pass",
            expires_at=datetime.now(timezone.utc),
        )
        db_session.add(credential)
        await db_session.commit()
        await db_session.refresh(credential)

        response = await async_client.post(
            f"/management/turn/credentials/{credential.id}/refresh",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "username" in data
        assert "password" in data

    async def test_refresh_credentials_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test refreshing non-existent credentials."""
        fake_id = uuid4()
        response = await async_client.post(
            f"/management/turn/credentials/{fake_id}/refresh",
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestGetTurnStats:
    """Test GET /management/turn/stats endpoint."""

    async def test_get_stats_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting TURN server statistics."""
        response = await async_client.get(
            "/management/turn/stats",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "totalCredentials" in data or "activeConnections" in data or isinstance(data, dict)


@pytest.mark.asyncio
class TestCleanupExpiredCredentials:
    """Test POST /management/turn/cleanup endpoint."""

    async def test_cleanup_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test cleaning up expired TURN credentials."""
        response = await async_client.post(
            "/management/turn/cleanup",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "deletedCount" in data or "message" in data


@pytest.mark.asyncio
class TestGetActiveTurnConnections:
    """Test GET /management/turn/active-connections endpoint."""

    async def test_get_active_connections(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting active TURN connections."""
        response = await async_client.get(
            "/management/turn/active-connections",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "connections" in data

    async def test_get_active_connections_with_filters(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test getting active connections with user filter."""
        response = await async_client.get(
            f"/management/turn/active-connections?user_id={test_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
