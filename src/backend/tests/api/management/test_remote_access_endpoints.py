"""
Tests for remote access management endpoints.
Tests api/routers/management/remote_access_router.py endpoints.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import RemoteAccess, User


@pytest.mark.asyncio
class TestListRemoteAccessSessions:
    """Test GET /management/remote-access/ endpoint."""

    async def test_list_sessions_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test listing remote access sessions successfully."""
        session1 = RemoteAccess(
            user_id=test_user.id,
            session_id="session-1",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        session2 = RemoteAccess(
            user_id=test_user.id,
            session_id="session-2",
            session_type="remote_assistance",
            status="completed",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session1)
        db_session.add(session2)
        await db_session.commit()

        response = await async_client.get(
            "/management/remote-access/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data or "items" in data
        assert "total" in data

    async def test_list_sessions_with_pagination(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing sessions with pagination."""
        response = await async_client.get(
            "/management/remote-access/?skip=0&limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_list_sessions_filter_by_status(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test filtering sessions by status."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="active-session",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        response = await async_client.get(
            "/management/remote-access/?status=active",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_list_sessions_unauthorized(
        self,
        async_client: AsyncClient,
    ):
        """Test listing sessions without authentication."""
        response = await async_client.get("/management/remote-access/")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetRemoteAccessSession:
    """Test GET /management/remote-access/{session_id} endpoint."""

    async def test_get_session_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting a remote access session successfully."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="test-session",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        response = await async_client.get(
            f"/management/remote-access/{session.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(session.id)
        assert data["sessionType"] == "remote_desktop"

    async def test_get_session_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting non-existent session."""
        fake_id = uuid4()
        response = await async_client.get(
            f"/management/remote-access/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_get_session_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting session with invalid ID format."""
        response = await async_client.get(
            "/management/remote-access/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestCreateRemoteAccessSession:
    """Test POST /management/remote-access/ endpoint."""

    async def test_create_session_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        mock_signalr_client,
    ):
        """Test creating a remote access session successfully."""
        payload = {
            "userId": str(test_user.id),
            "sessionType": "remote_desktop",
            "targetMachine": "PC-001",
        }

        response = await async_client.post(
            "/management/remote-access/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert "id" in data or "sessionId" in data

    async def test_create_session_missing_fields(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test creating session with missing required fields."""
        payload = {
            "userId": str(uuid4()),
        }

        response = await async_client.post(
            "/management/remote-access/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestInitiateRemoteSession:
    """Test POST /management/remote-access/initiate endpoint."""

    async def test_initiate_session_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        mock_signalr_client,
    ):
        """Test initiating a remote session successfully."""
        payload = {
            "targetUserId": str(test_user.id),
            "sessionType": "remote_assistance",
        }

        response = await async_client.post(
            "/management/remote-access/initiate",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code in [200, 201, 202]

    async def test_initiate_session_invalid_user(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test initiating session with invalid user ID."""
        payload = {
            "targetUserId": str(uuid4()),
            "sessionType": "remote_assistance",
        }

        response = await async_client.post(
            "/management/remote-access/initiate",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code in [404, 400]


@pytest.mark.asyncio
class TestTerminateRemoteSession:
    """Test POST /management/remote-access/{session_id}/terminate endpoint."""

    async def test_terminate_session_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_signalr_client,
    ):
        """Test terminating a remote session successfully."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="terminate-test",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        response = await async_client.post(
            f"/management/remote-access/{session.id}/terminate",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(session.id)

    async def test_terminate_session_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test terminating non-existent session."""
        fake_id = uuid4()
        response = await async_client.post(
            f"/management/remote-access/{fake_id}/terminate",
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestGetActiveRemoteSessions:
    """Test GET /management/remote-access/active endpoint."""

    async def test_get_active_sessions(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting active remote sessions."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="active-1",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        response = await async_client.get(
            "/management/remote-access/active",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "sessions" in data


@pytest.mark.asyncio
class TestGetUserRemoteSessions:
    """Test GET /management/remote-access/user/{user_id} endpoint."""

    async def test_get_user_sessions(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test getting remote sessions for a specific user."""
        response = await async_client.get(
            f"/management/remote-access/user/{test_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_get_user_sessions_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting sessions with invalid user ID."""
        response = await async_client.get(
            "/management/remote-access/user/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestUpdateRemoteSessionStatus:
    """Test PUT /management/remote-access/{session_id}/status endpoint."""

    async def test_update_status_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test updating session status successfully."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="update-status",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        payload = {"status": "paused"}

        response = await async_client.put(
            f"/management/remote-access/{session.id}/status",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_update_status_invalid(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test updating with invalid status."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="invalid-status",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        payload = {"status": "invalid_status"}

        response = await async_client.put(
            f"/management/remote-access/{session.id}/status",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestGetRemoteAccessStats:
    """Test GET /management/remote-access/stats endpoint."""

    async def test_get_stats_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting remote access statistics."""
        response = await async_client.get(
            "/management/remote-access/stats",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "totalSessions" in data


@pytest.mark.asyncio
class TestSendRemoteCommand:
    """Test POST /management/remote-access/{session_id}/command endpoint."""

    async def test_send_command_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_signalr_client,
    ):
        """Test sending command to remote session."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="command-test",
            session_type="remote_desktop",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        payload = {
            "command": "refresh",
            "parameters": {}
        }

        response = await async_client.post(
            f"/management/remote-access/{session.id}/command",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code in [200, 202]

    async def test_send_command_inactive_session(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test sending command to inactive session."""
        session = RemoteAccess(
            user_id=test_user.id,
            session_id="inactive-command",
            session_type="remote_desktop",
            status="completed",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        payload = {
            "command": "refresh",
            "parameters": {}
        }

        response = await async_client.post(
            f"/management/remote-access/{session.id}/command",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code in [400, 409]
