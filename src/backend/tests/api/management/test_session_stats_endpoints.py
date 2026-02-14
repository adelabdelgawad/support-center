"""
Tests for session statistics endpoints.
Tests api/routers/management/session_stats_router.py endpoints.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import DesktopSession, User


@pytest.mark.asyncio
class TestGetSessionStats:
    """Test GET /management/session-stats/ endpoint."""

    async def test_get_stats_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting session statistics successfully."""
        # Create test sessions
        session1 = DesktopSession(
            user_id=test_user.id,
            device_id="stats-device-1",
            machine_name="STATS-PC-1",
            ip_address="192.168.1.100",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        session2 = DesktopSession(
            user_id=test_user.id,
            device_id="stats-device-2",
            machine_name="STATS-PC-2",
            ip_address="192.168.1.101",
            status="inactive",
            started_at=datetime.now(timezone.utc) - timedelta(hours=2),
            ended_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db_session.add(session1)
        db_session.add(session2)
        await db_session.commit()

        response = await async_client.get(
            "/management/session-stats/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "totalSessions" in data or "total" in data

    async def test_get_stats_with_date_range(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting stats with date range filter."""
        start_date = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        end_date = datetime.now(timezone.utc).isoformat()

        response = await async_client.get(
            f"/management/session-stats/?start_date={start_date}&end_date={end_date}",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_get_stats_unauthorized(
        self,
        async_client: AsyncClient,
    ):
        """Test getting stats without authentication."""
        response = await async_client.get("/management/session-stats/")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetUserSessionStats:
    """Test GET /management/session-stats/user/{user_id} endpoint."""

    async def test_get_user_stats_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting session stats for a specific user."""
        session = DesktopSession(
            user_id=test_user.id,
            device_id="user-stats-device",
            machine_name="USER-STATS-PC",
            ip_address="192.168.1.110",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        response = await async_client.get(
            f"/management/session-stats/user/{test_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "userId" in data or "totalSessions" in data

    async def test_get_user_stats_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting stats with invalid user ID."""
        response = await async_client.get(
            "/management/session-stats/user/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_get_user_stats_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting stats for non-existent user."""
        fake_id = uuid4()
        response = await async_client.get(
            f"/management/session-stats/user/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code in [404, 200]


@pytest.mark.asyncio
class TestGetDailySessionStats:
    """Test GET /management/session-stats/daily endpoint."""

    async def test_get_daily_stats_success(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting daily session statistics."""
        response = await async_client.get(
            "/management/session-stats/daily",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "stats" in data

    async def test_get_daily_stats_with_days_param(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting daily stats with days parameter."""
        response = await async_client.get(
            "/management/session-stats/daily?days=7",
            headers=auth_headers,
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestGetActiveUsersCount:
    """Test GET /management/session-stats/active-users endpoint."""

    async def test_get_active_users_count(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        mock_redis,
    ):
        """Test getting active users count."""
        session = DesktopSession(
            user_id=test_user.id,
            device_id="active-count-device",
            machine_name="ACTIVE-COUNT-PC",
            ip_address="192.168.1.120",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        response = await async_client.get(
            "/management/session-stats/active-users",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "count" in data or "activeUsers" in data


@pytest.mark.asyncio
class TestGetSessionDurationStats:
    """Test GET /management/session-stats/duration endpoint."""

    async def test_get_duration_stats(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting session duration statistics."""
        response = await async_client.get(
            "/management/session-stats/duration",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "averageDuration" in data or "stats" in data

    async def test_get_duration_stats_with_date_range(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting duration stats with date range."""
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        end_date = datetime.now(timezone.utc).isoformat()

        response = await async_client.get(
            f"/management/session-stats/duration?start_date={start_date}&end_date={end_date}",
            headers=auth_headers,
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestGetPeakUsageHours:
    """Test GET /management/session-stats/peak-hours endpoint."""

    async def test_get_peak_hours(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting peak usage hours."""
        response = await async_client.get(
            "/management/session-stats/peak-hours",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "hours" in data


@pytest.mark.asyncio
class TestGetDeviceStats:
    """Test GET /management/session-stats/devices endpoint."""

    async def test_get_device_stats(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting device statistics."""
        session = DesktopSession(
            user_id=test_user.id,
            device_id="device-stats-1",
            machine_name="DEVICE-STATS-PC",
            ip_address="192.168.1.130",
            status="active",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        response = await async_client.get(
            "/management/session-stats/devices",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "devices" in data

    async def test_get_device_stats_with_limit(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting device stats with limit."""
        response = await async_client.get(
            "/management/session-stats/devices?limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestGetTopUsers:
    """Test GET /management/session-stats/top-users endpoint."""

    async def test_get_top_users(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting top users by session count."""
        response = await async_client.get(
            "/management/session-stats/top-users",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "users" in data

    async def test_get_top_users_with_limit(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting top users with limit parameter."""
        response = await async_client.get(
            "/management/session-stats/top-users?limit=5",
            headers=auth_headers,
        )

        assert response.status_code == 200


@pytest.mark.asyncio
class TestExportSessionStats:
    """Test GET /management/session-stats/export endpoint."""

    async def test_export_stats_csv(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test exporting session stats as CSV."""
        response = await async_client.get(
            "/management/session-stats/export?format=csv",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_export_stats_json(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test exporting session stats as JSON."""
        response = await async_client.get(
            "/management/session-stats/export?format=json",
            headers=auth_headers,
        )

        assert response.status_code == 200
