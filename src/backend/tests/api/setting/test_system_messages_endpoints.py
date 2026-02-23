"""Tests for system messages endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import SystemMessage, User


class TestSystemMessagesEndpoints:
    """Test suite for /api/setting/system-messages/ endpoints."""

    @pytest.mark.asyncio
    async def test_get_system_messages_empty_db(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/system-messages/ with empty database."""
        response = await client.get("/backend/system-messages/")
        assert response.status_code == 200

        data = response.json()
        assert "systemMessages" in data
        assert "total" in data
        assert isinstance(data["systemMessages"], list)
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_get_system_messages_with_data(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/system-messages/ with existing messages."""
        msg1 = SystemMessage(
            title="Maintenance Notice",
            message="System will be down for maintenance",
            message_type="info",
            is_active=True,
        )
        msg2 = SystemMessage(
            title="Critical Alert",
            message="Security update required",
            message_type="error",
            is_active=False,
        )
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        response = await client.get("/backend/system-messages/")
        assert response.status_code == 200

        data = response.json()
        assert len(data["systemMessages"]) == 2
        assert data["total"] == 2

        # Verify camelCase fields
        assert "isActive" in data["systemMessages"][0]
        assert "messageType" in data["systemMessages"][0]

    @pytest.mark.asyncio
    async def test_get_system_messages_pagination(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/system-messages/ pagination."""
        for i in range(5):
            msg = SystemMessage(
                title=f"Message {i}",
                message=f"Content {i}",
                message_type="info",
                is_active=True,
            )
            db_session.add(msg)
        await db_session.commit()

        response = await client.get("/backend/system-messages/?limit=2&skip=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["systemMessages"]) == 2
        assert data["total"] == 5

    @pytest.mark.asyncio
    async def test_get_system_messages_filter_by_status(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/system-messages/ with is_active filter."""
        msg1 = SystemMessage(title="Active Message", message="Content", message_type="info", is_active=True)
        msg2 = SystemMessage(title="Inactive Message", message="Content", message_type="info", is_active=False)
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        response = await client.get("/backend/system-messages/?is_active=true")
        assert response.status_code == 200
        data = response.json()
        assert len(data["systemMessages"]) == 1
        assert data["systemMessages"][0]["isActive"] is True

    @pytest.mark.asyncio
    async def test_get_system_messages_filter_by_type(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/system-messages/ with message_type filter."""
        msg1 = SystemMessage(title="Info Message", message="Content", message_type="info", is_active=True)
        msg2 = SystemMessage(title="Error Message", message="Content", message_type="error", is_active=True)
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        response = await client.get("/backend/system-messages/?message_type=error")
        assert response.status_code == 200
        data = response.json()
        assert len(data["systemMessages"]) == 1
        assert data["systemMessages"][0]["messageType"] == "error"

    @pytest.mark.asyncio
    async def test_get_system_messages_search(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/system-messages/ with search."""
        msg1 = SystemMessage(title="Maintenance Notice", message="Content", message_type="info", is_active=True)
        msg2 = SystemMessage(title="Security Alert", message="Content", message_type="warning", is_active=True)
        db_session.add_all([msg1, msg2])
        await db_session.commit()

        response = await client.get("/backend/system-messages/?search=maintenance")
        assert response.status_code == 200
        data = response.json()
        assert len(data["systemMessages"]) == 1
        assert "maintenance" in data["systemMessages"][0]["title"].lower()

    @pytest.mark.asyncio
    async def test_get_system_message_by_id(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test GET /api/setting/system-messages/{message_id}."""
        msg = SystemMessage(
            title="Test Message",
            message="Test content",
            message_type="info",
            is_active=True,
        )
        db_session.add(msg)
        await db_session.commit()
        await db_session.refresh(msg)

        response = await client.get(f"/backend/system-messages/{msg.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == msg.id
        assert data["title"] == "Test Message"
        assert data["message"] == "Test content"

    @pytest.mark.asyncio
    async def test_get_system_message_by_id_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test GET /api/setting/system-messages/{message_id} with non-existent ID."""
        response = await client.get("/backend/system-messages/99999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_system_message(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/system-messages/."""
        msg_data = {
            "title": "New Message",
            "message": "New content",
            "messageType": "info",
            "isActive": True,
        }

        response = await client.post("/backend/system-messages/", json=msg_data)
        assert response.status_code == 200

        data = response.json()
        assert data["title"] == "New Message"
        assert data["message"] == "New content"
        assert data["messageType"] == "info"
        assert data["isActive"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_system_message_validation_error(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test POST /api/setting/system-messages/ with invalid data."""
        msg_data = {"title": "Missing message field"}

        response = await client.post("/backend/system-messages/", json=msg_data)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_system_message(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test PUT /api/setting/system-messages/{message_id}."""
        msg = SystemMessage(title="Old Title", message="Old content", message_type="info", is_active=True)
        db_session.add(msg)
        await db_session.commit()
        await db_session.refresh(msg)

        update_data = {
            "title": "Updated Title",
            "message": "Updated content",
            "messageType": "warning",
            "isActive": False,
        }

        response = await client.put(f"/backend/system-messages/{msg.id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["message"] == "Updated content"
        assert data["messageType"] == "warning"
        assert data["isActive"] is False

    @pytest.mark.asyncio
    async def test_update_system_message_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test PUT /api/setting/system-messages/{message_id} with non-existent ID."""
        update_data = {"title": "Updated"}

        response = await client.put("/backend/system-messages/99999", json=update_data)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_system_message(
        self, client: AsyncClient, seed_admin_user: User, db_session: AsyncSession
    ) -> None:
        """Test DELETE /api/setting/system-messages/{message_id}."""
        msg = SystemMessage(title="To Delete", message="Content", message_type="info", is_active=True)
        db_session.add(msg)
        await db_session.commit()
        await db_session.refresh(msg)

        response = await client.delete(f"/backend/system-messages/{msg.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["message"] == "System message deleted successfully"

    @pytest.mark.asyncio
    async def test_delete_system_message_not_found(
        self, client: AsyncClient, seed_admin_user: User
    ) -> None:
        """Test DELETE /api/setting/system-messages/{message_id} with non-existent ID."""
        response = await client.delete("/backend/system-messages/99999")
        assert response.status_code == 404
