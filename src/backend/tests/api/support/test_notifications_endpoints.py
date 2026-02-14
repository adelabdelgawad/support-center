"""Tests for notifications endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from unittest.mock import AsyncMock

from db.models import User, Notification


@pytest.mark.asyncio
class TestNotificationsEndpoints:
    """Test notifications CRUD endpoints."""

    async def test_get_notifications_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/notifications/."""
        response = await async_client.get(
            "/support/notifications/",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"skip": 0, "limit": 20},
        )
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert isinstance(data["notifications"], list)

    async def test_get_unread_notifications_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/notifications/unread."""
        response = await async_client.get(
            "/support/notifications/unread",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "notifications" in data
        assert isinstance(data["notifications"], list)

    async def test_get_unread_count_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/notifications/unread-count."""
        response = await async_client.get(
            "/support/notifications/unread-count",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)

    async def test_mark_notification_as_read_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test PUT /support/notifications/{notification_id}/read."""
        # Create test notification
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        notification = Notification(
            user_id=user.id,
            title="Test Notification",
            message="Test message",
            notification_type="info",
            is_read=False,
        )
        db_session.add(notification)
        await db_session.commit()
        await db_session.refresh(notification)

        response = await async_client.put(
            f"/support/notifications/{notification.id}/read",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_mark_all_as_read_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test PUT /support/notifications/read-all."""
        response = await async_client.put(
            "/support/notifications/read-all",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_delete_notification_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test DELETE /support/notifications/{notification_id}."""
        # Create test notification
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        notification = Notification(
            user_id=user.id,
            title="Test Notification",
            message="Test message",
            notification_type="info",
            is_read=False,
        )
        db_session.add(notification)
        await db_session.commit()
        await db_session.refresh(notification)

        response = await async_client.delete(
            f"/support/notifications/{notification.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_delete_all_notifications_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test DELETE /support/notifications/all."""
        response = await async_client.delete(
            "/support/notifications/all",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_send_notification_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_signalr_client: AsyncMock,
    ):
        """Test POST /support/notifications/send."""
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        payload = {
            "userId": str(user.id),
            "title": "Test Notification",
            "message": "Test message",
            "notificationType": "info",
        }

        response = await async_client.post(
            "/support/notifications/send",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_get_notification_settings_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/notifications/settings."""
        response = await async_client.get(
            "/support/notifications/settings",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_update_notification_settings_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test PUT /support/notifications/settings."""
        payload = {
            "emailNotifications": True,
            "pushNotifications": False,
        }

        response = await async_client.put(
            "/support/notifications/settings",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200

    async def test_unauthorized_access(
        self,
        async_client: AsyncClient,
    ):
        """Test notifications endpoints without authentication."""
        response = await async_client.get("/support/notifications/")
        assert response.status_code == 401
