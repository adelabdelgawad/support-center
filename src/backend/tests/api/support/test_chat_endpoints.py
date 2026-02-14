"""Tests for chat endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from unittest.mock import AsyncMock

from db.models import ServiceRequest, User, ChatMessage, Priority, RequestStatus, RequestType


@pytest.mark.asyncio
class TestChatEndpoints:
    """Test chat CRUD endpoints."""

    async def test_get_chat_messages_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/chat/requests/{request_id}/messages."""
        # Create test request
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.get(
            f"/support/chat/requests/{request.id}/messages",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"skip": 0, "limit": 50},
        )
        assert response.status_code == 200
        data = response.json()
        assert "messages" in data
        assert isinstance(data["messages"], list)

    async def test_send_chat_message_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_signalr_client: AsyncMock,
    ):
        """Test POST /support/chat/requests/{request_id}/messages."""
        # Create test request
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        payload = {
            "message": "Hello from test",
            "messageType": "text",
        }

        response = await async_client.post(
            f"/support/chat/requests/{request.id}/messages",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["message"] == "Hello from test"
        assert "id" in data

    async def test_send_chat_message_request_not_found(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test POST /support/chat/requests/{request_id}/messages with invalid request."""
        payload = {
            "message": "Hello",
            "messageType": "text",
        }

        response = await async_client.post(
            "/support/chat/requests/99999/messages",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 404

    async def test_get_chat_message_by_id_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/chat/messages/{message_id}."""
        # Create test request and message
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        message = ChatMessage(
            request_id=request.id,
            sender_id=user.id,
            message="Test message",
            message_type="text",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        response = await async_client.get(
            f"/support/chat/messages/{message.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == message.id
        assert data["message"] == "Test message"

    async def test_update_chat_message_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_signalr_client: AsyncMock,
    ):
        """Test PUT /support/chat/messages/{message_id}."""
        # Create test request and message
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        message = ChatMessage(
            request_id=request.id,
            sender_id=user.id,
            message="Original message",
            message_type="text",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        payload = {"message": "Updated message"}

        response = await async_client.put(
            f"/support/chat/messages/{message.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Updated message"

    async def test_delete_chat_message_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_signalr_client: AsyncMock,
    ):
        """Test DELETE /support/chat/messages/{message_id}."""
        # Create test request and message
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        message = ChatMessage(
            request_id=request.id,
            sender_id=user.id,
            message="To delete",
            message_type="text",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        response = await async_client.delete(
            f"/support/chat/messages/{message.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_mark_messages_as_read_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test PUT /support/chat/requests/{request_id}/read."""
        # Create test request
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.put(
            f"/support/chat/requests/{request.id}/read",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_get_unread_count_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/chat/requests/{request_id}/unread-count."""
        # Create test request
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.get(
            f"/support/chat/requests/{request.id}/unread-count",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "unreadCount" in data

    async def test_typing_indicator_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_signalr_client: AsyncMock,
    ):
        """Test POST /support/chat/requests/{request_id}/typing."""
        # Create test request
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        payload = {"isTyping": True}

        response = await async_client.post(
            f"/support/chat/requests/{request.id}/typing",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200

    async def test_get_chat_participants_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/chat/requests/{request_id}/participants."""
        # Create test request
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.get(
            f"/support/chat/requests/{request.id}/participants",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    async def test_unauthorized_access(
        self,
        async_client: AsyncClient,
    ):
        """Test chat endpoints without authentication."""
        response = await async_client.get("/support/chat/requests/1/messages")
        assert response.status_code == 401
