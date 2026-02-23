"""
Tests for desktop sessions management endpoints.
Tests api/routers/management/desktop_sessions_router.py endpoints.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import DesktopSession, User


@pytest.mark.asyncio
class TestListDesktopSessions:
    """Test GET /management/desktop-sessions/ endpoint."""

    async def test_list_sessions_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test listing desktop sessions successfully."""
        # Create test sessions
        session1 = DesktopSession(
            user_id=test_user.id,
            device_id="device-1",
            machine_name="DESKTOP-001",
            ip_address="192.168.1.100",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        session2 = DesktopSession(
            user_id=test_user.id,
            device_id="device-2",
            machine_name="LAPTOP-001",
            ip_address="192.168.1.101",
            status="inactive",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session1)
        db_session.add(session2)
        await db_session.commit()

        response = await async_client.get(
            "/management/desktop-sessions/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data
        assert "total" in data
        assert len(data["sessions"]) >= 2
        assert data["total"] >= 2

    async def test_list_sessions_with_pagination(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing sessions with pagination."""
        response = await async_client.get(
            "/management/desktop-sessions/?skip=0&limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data
        assert len(data["sessions"]) <= 10

    async def test_list_sessions_filter_by_status(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test filtering sessions by status."""
        session = DesktopSession(
            user_id=test_user.id,
            device_id="device-active",
            machine_name="ACTIVE-PC",
            ip_address="192.168.1.200",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        response = await async_client.get(
            "/management/desktop-sessions/?status=active",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        sessions = data["sessions"]
        assert all(s["status"] == "active" for s in sessions)

    async def test_list_sessions_filter_by_user(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test filtering sessions by user ID."""
        response = await async_client.get(
            f"/management/desktop-sessions/?user_id={test_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        sessions = data["sessions"]
        assert all(s["userId"] == str(test_user.id) for s in sessions)

    async def test_list_sessions_unauthorized(
        self,
        async_client: AsyncClient,
    ):
        """Test listing sessions without authentication."""
        response = await async_client.get("/management/desktop-sessions/")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetDesktopSession:
    """Test GET /management/desktop-sessions/{session_id} endpoint."""

    async def test_get_session_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting a desktop session successfully."""
        session = DesktopSession(
            user_id=test_user.id,
            device_id="device-test",
            machine_name="TEST-PC",
            ip_address="192.168.1.150",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        response = await async_client.get(
            f"/management/desktop-sessions/{session.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(session.id)
        assert data["machineName"] == "TEST-PC"
        assert data["status"] == "active"

    async def test_get_session_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting non-existent session."""
        fake_id = uuid4()
        response = await async_client.get(
            f"/management/desktop-sessions/{fake_id}",
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
            "/management/desktop-sessions/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestHeartbeat:
    """Test POST /management/desktop-sessions/heartbeat endpoint."""

    async def test_heartbeat_new_session(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        mock_redis,
    ):
        """Test heartbeat creating new session."""
        payload = {
            "userId": str(test_user.id),
            "deviceId": "new-device",
            "machineName": "NEW-PC",
            "ipAddress": "192.168.1.250",
        }

        response = await async_client.post(
            "/management/desktop-sessions/heartbeat",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"
        assert data["machineName"] == "NEW-PC"

    async def test_heartbeat_existing_session(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_redis,
    ):
        """Test heartbeat updating existing session."""
        session = DesktopSession(
            user_id=test_user.id,
            device_id="existing-device",
            machine_name="EXISTING-PC",
            ip_address="192.168.1.200",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        payload = {
            "userId": str(test_user.id),
            "deviceId": "existing-device",
            "machineName": "EXISTING-PC",
            "ipAddress": "192.168.1.200",
        }

        response = await async_client.post(
            "/management/desktop-sessions/heartbeat",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["deviceId"] == "existing-device"

    async def test_heartbeat_missing_fields(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test heartbeat with missing required fields."""
        payload = {
            "userId": str(uuid4()),
            "deviceId": "test-device",
        }

        response = await async_client.post(
            "/management/desktop-sessions/heartbeat",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestGetActiveSessionsCount:
    """Test GET /management/desktop-sessions/active/count endpoint."""

    async def test_get_active_count_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        mock_redis,
    ):
        """Test getting active sessions count."""
        # Mock Redis to return active sessions
        mock_redis.scan_iter.return_value = [
            b"desktop_session:user1:device1",
            b"desktop_session:user2:device2",
        ]

        response = await async_client.get(
            "/management/desktop-sessions/active/count",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)


@pytest.mark.asyncio
class TestGetUserActiveSessions:
    """Test GET /management/desktop-sessions/user/{user_id}/active endpoint."""

    async def test_get_user_active_sessions(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        mock_redis,
    ):
        """Test getting active sessions for a user."""
        response = await async_client.get(
            f"/management/desktop-sessions/user/{test_user.id}/active",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data
        assert isinstance(data["sessions"], list)

    async def test_get_user_active_sessions_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting active sessions with invalid user ID."""
        response = await async_client.get(
            "/management/desktop-sessions/user/invalid-id/active",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestTerminateSession:
    """Test POST /management/desktop-sessions/{session_id}/terminate endpoint."""

    async def test_terminate_session_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_redis,
    ):
        """Test terminating a session successfully."""
        session = DesktopSession(
            user_id=test_user.id,
            device_id="device-terminate",
            machine_name="TERMINATE-PC",
            ip_address="192.168.1.201",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()
        await db_session.refresh(session)

        response = await async_client.post(
            f"/management/desktop-sessions/{session.id}/terminate",
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
            f"/management/desktop-sessions/{fake_id}/terminate",
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestBulkTerminateSessions:
    """Test POST /management/desktop-sessions/bulk-terminate endpoint."""

    async def test_bulk_terminate_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_redis,
    ):
        """Test bulk terminating sessions."""
        session1 = DesktopSession(
            user_id=test_user.id,
            device_id="bulk-1",
            machine_name="BULK-PC-1",
            ip_address="192.168.1.210",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        session2 = DesktopSession(
            user_id=test_user.id,
            device_id="bulk-2",
            machine_name="BULK-PC-2",
            ip_address="192.168.1.211",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session1)
        db_session.add(session2)
        await db_session.commit()
        await db_session.refresh(session1)
        await db_session.refresh(session2)

        payload = {
            "sessionIds": [str(session1.id), str(session2.id)]
        }

        response = await async_client.post(
            "/management/desktop-sessions/bulk-terminate",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "terminatedCount" in data

    async def test_bulk_terminate_empty_list(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test bulk terminate with empty session list."""
        payload: dict[str, list[object]] = {"sessionIds": []}

        response = await async_client.post(
            "/management/desktop-sessions/bulk-terminate",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422 or response.status_code == 200


@pytest.mark.asyncio
class TestGetSessionStats:
    """Test GET /management/desktop-sessions/stats endpoint."""

    async def test_get_stats_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        mock_redis,
    ):
        """Test getting session statistics."""
        response = await async_client.get(
            "/management/desktop-sessions/stats",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "totalSessions" in data or "total" in data


@pytest.mark.asyncio
class TestGetSessionHistory:
    """Test GET /management/desktop-sessions/user/{user_id}/history endpoint."""

    async def test_get_session_history(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test getting session history for a user."""
        response = await async_client.get(
            f"/management/desktop-sessions/user/{test_user.id}/history",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "sessions" in data or isinstance(data, list)

    async def test_get_session_history_with_limit(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test getting session history with limit."""
        response = await async_client.get(
            f"/management/desktop-sessions/user/{test_user.id}/history?limit=5",
            headers=auth_headers,
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestCleanupInactiveSessions:
    """Test POST /management/desktop-sessions/cleanup endpoint."""

    async def test_cleanup_inactive_sessions(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
        mock_redis,
    ):
        """Test cleaning up inactive sessions."""
        response = await async_client.post(
            "/management/desktop-sessions/cleanup",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "cleanedCount" in data or "message" in data
