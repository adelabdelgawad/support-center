"""Tests for chat file attachments endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from unittest.mock import AsyncMock
from io import BytesIO

from db.models import ServiceRequest, User, ChatMessage, ChatFile, Priority, RequestStatus, RequestType


@pytest.mark.asyncio
class TestChatFilesEndpoints:
    """Test chat file attachments CRUD endpoints."""

    async def test_get_chat_files_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/chat-files/messages/{message_id}."""
        # Create test request, message
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Files Test",
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
            f"/support/chat-files/messages/{message.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "files" in data
        assert isinstance(data["files"], list)

    async def test_upload_chat_file_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test POST /support/chat-files/messages/{message_id}."""
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
            title="Chat Files Test",
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
            message_type="file",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        # Mock MinIO upload
        mock_minio_service.upload_file.return_value = "chat-files/test.pdf"

        # Create fake file
        file_content = b"fake file content"
        files = {
            "file": ("test.pdf", BytesIO(file_content), "application/pdf")
        }

        response = await async_client.post(
            f"/support/chat-files/messages/{message.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
            files=files,
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "filePath" in data

    async def test_get_chat_file_by_id_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/chat-files/{file_id}."""
        # Create test request, message, and file
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Files Test",
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
            message_type="file",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        chat_file = ChatFile(
            message_id=message.id,
            file_path="chat-files/test.pdf",
            file_name="test.pdf",
            file_size=1024,
            mime_type="application/pdf",
        )
        db_session.add(chat_file)
        await db_session.commit()
        await db_session.refresh(chat_file)

        response = await async_client.get(
            f"/support/chat-files/{chat_file.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == chat_file.id

    async def test_download_chat_file_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test GET /support/chat-files/{file_id}/download."""
        # Create test request, message, and file
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Files Test",
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
            message_type="file",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        chat_file = ChatFile(
            message_id=message.id,
            file_path="chat-files/test.pdf",
            file_name="test.pdf",
            file_size=1024,
            mime_type="application/pdf",
        )
        db_session.add(chat_file)
        await db_session.commit()
        await db_session.refresh(chat_file)

        # Mock MinIO download
        mock_minio_service.download_file.return_value = BytesIO(b"fake file")

        response = await async_client.get(
            f"/support/chat-files/{chat_file.id}/download",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_delete_chat_file_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test DELETE /support/chat-files/{file_id}."""
        # Create test request, message, and file
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Files Test",
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
            message_type="file",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        chat_file = ChatFile(
            message_id=message.id,
            file_path="chat-files/test.pdf",
            file_name="test.pdf",
            file_size=1024,
            mime_type="application/pdf",
        )
        db_session.add(chat_file)
        await db_session.commit()
        await db_session.refresh(chat_file)

        # Mock MinIO delete
        mock_minio_service.delete_file.return_value = True

        response = await async_client.delete(
            f"/support/chat-files/{chat_file.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_bulk_delete_chat_files_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test DELETE /support/chat-files/bulk."""
        # Create test request, message, and files
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Chat Files Test",
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
            message_type="file",
        )
        db_session.add(message)
        await db_session.commit()
        await db_session.refresh(message)

        file1 = ChatFile(
            message_id=message.id,
            file_path="chat-files/test1.pdf",
            file_name="test1.pdf",
            file_size=1024,
            mime_type="application/pdf",
        )
        file2 = ChatFile(
            message_id=message.id,
            file_path="chat-files/test2.pdf",
            file_name="test2.pdf",
            file_size=2048,
            mime_type="application/pdf",
        )
        db_session.add(file1)
        db_session.add(file2)
        await db_session.commit()
        await db_session.refresh(file1)
        await db_session.refresh(file2)

        # Mock MinIO delete
        mock_minio_service.delete_file.return_value = True

        payload = {"fileIds": [file1.id, file2.id]}

        response = await async_client.delete(
            "/support/chat-files/bulk",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200

    async def test_unauthorized_access(
        self,
        async_client: AsyncClient,
    ):
        """Test chat files endpoints without authentication."""
        response = await async_client.get("/support/chat-files/messages/1")
        assert response.status_code == 401
