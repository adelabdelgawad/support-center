"""
Tests for system events management endpoints.
Tests api/routers/management/system_events_router.py endpoints.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import SystemEvent, User


@pytest.mark.asyncio
class TestListSystemEvents:
    """Test GET /management/system-events/ endpoint."""

    async def test_list_events_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test listing system events successfully."""
        event1 = SystemEvent(
            event_type="user_login",
            event_category="authentication",
            severity="info",
            description="User logged in successfully",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        event2 = SystemEvent(
            event_type="config_change",
            event_category="configuration",
            severity="warning",
            description="System configuration changed",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(event1)
        db_session.add(event2)
        await db_session.commit()

        response = await async_client.get(
            "/management/system-events/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "events" in data or isinstance(data, list)

    async def test_list_events_with_pagination(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test listing events with pagination."""
        response = await async_client.get(
            "/management/system-events/?skip=0&limit=10",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_list_events_filter_by_severity(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test filtering events by severity."""
        event = SystemEvent(
            event_type="error_occurred",
            event_category="system",
            severity="error",
            description="System error occurred",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        await db_session.commit()

        response = await async_client.get(
            "/management/system-events/?severity=error",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_list_events_filter_by_category(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test filtering events by category."""
        event = SystemEvent(
            event_type="auth_failure",
            event_category="authentication",
            severity="warning",
            description="Authentication failed",
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        await db_session.commit()

        response = await async_client.get(
            "/management/system-events/?category=authentication",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_list_events_unauthorized(
        self,
        async_client: AsyncClient,
    ):
        """Test listing events without authentication."""
        response = await async_client.get("/management/system-events/")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestGetSystemEvent:
    """Test GET /management/system-events/{event_id} endpoint."""

    async def test_get_event_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting a system event successfully."""
        event = SystemEvent(
            event_type="test_event",
            event_category="test",
            severity="info",
            description="Test event",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        await db_session.commit()
        await db_session.refresh(event)

        response = await async_client.get(
            f"/management/system-events/{event.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(event.id)
        assert data["eventType"] == "test_event"

    async def test_get_event_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting non-existent event."""
        fake_id = uuid4()
        response = await async_client.get(
            f"/management/system-events/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404

    async def test_get_event_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting event with invalid ID format."""
        response = await async_client.get(
            "/management/system-events/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestCreateSystemEvent:
    """Test POST /management/system-events/ endpoint."""

    async def test_create_event_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test creating a system event successfully."""
        payload = {
            "eventType": "new_event",
            "eventCategory": "system",
            "severity": "info",
            "description": "A new system event",
            "userId": str(test_user.id),
        }

        response = await async_client.post(
            "/management/system-events/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200 or response.status_code == 201
        data = response.json()
        assert data["eventType"] == "new_event"

    async def test_create_event_missing_fields(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test creating event with missing required fields."""
        payload = {
            "eventType": "incomplete_event",
        }

        response = await async_client.post(
            "/management/system-events/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_create_event_invalid_severity(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        """Test creating event with invalid severity."""
        payload = {
            "eventType": "test_event",
            "eventCategory": "system",
            "severity": "invalid_severity",
            "description": "Test event",
            "userId": str(test_user.id),
        }

        response = await async_client.post(
            "/management/system-events/",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestGetEventsByUser:
    """Test GET /management/system-events/user/{user_id} endpoint."""

    async def test_get_events_by_user(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test getting events for a specific user."""
        event = SystemEvent(
            event_type="user_action",
            event_category="user",
            severity="info",
            description="User performed an action",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        await db_session.commit()

        response = await async_client.get(
            f"/management/system-events/user/{test_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "events" in data

    async def test_get_events_by_user_invalid_id(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting events with invalid user ID."""
        response = await async_client.get(
            "/management/system-events/user/invalid-id",
            headers=auth_headers,
        )

        assert response.status_code == 422


@pytest.mark.asyncio
class TestDeleteSystemEvent:
    """Test DELETE /management/system-events/{event_id} endpoint."""

    async def test_delete_event_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test deleting a system event successfully."""
        event = SystemEvent(
            event_type="delete_test",
            event_category="test",
            severity="info",
            description="Event to be deleted",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        await db_session.commit()
        await db_session.refresh(event)

        response = await async_client.delete(
            f"/management/system-events/{event.id}",
            headers=auth_headers,
        )

        assert response.status_code in [200, 204]

    async def test_delete_event_not_found(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test deleting non-existent event."""
        fake_id = uuid4()
        response = await async_client.delete(
            f"/management/system-events/{fake_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


@pytest.mark.asyncio
class TestBulkDeleteSystemEvents:
    """Test POST /management/system-events/bulk-delete endpoint."""

    async def test_bulk_delete_success(
        self,
        async_client: AsyncClient,
        test_user: User,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Test bulk deleting system events."""
        event1 = SystemEvent(
            event_type="bulk_delete_1",
            event_category="test",
            severity="info",
            description="Event 1",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        event2 = SystemEvent(
            event_type="bulk_delete_2",
            event_category="test",
            severity="info",
            description="Event 2",
            user_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(event1)
        db_session.add(event2)
        await db_session.commit()
        await db_session.refresh(event1)
        await db_session.refresh(event2)

        payload = {
            "eventIds": [str(event1.id), str(event2.id)]
        }

        response = await async_client.post(
            "/management/system-events/bulk-delete",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "deletedCount" in data or "count" in data

    async def test_bulk_delete_empty_list(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test bulk delete with empty event list."""
        payload = {"eventIds": []}

        response = await async_client.post(
            "/management/system-events/bulk-delete",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == 422 or response.status_code == 200


@pytest.mark.asyncio
class TestGetEventStats:
    """Test GET /management/system-events/stats endpoint."""

    async def test_get_event_stats(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting system event statistics."""
        response = await async_client.get(
            "/management/system-events/stats",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "totalEvents" in data

    async def test_get_event_stats_by_severity(
        self,
        async_client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test getting event stats grouped by severity."""
        response = await async_client.get(
            "/management/system-events/stats?group_by=severity",
            headers=auth_headers,
        )

        assert response.status_code == 200
