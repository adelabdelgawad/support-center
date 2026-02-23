"""Tests for file attachments endpoints."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import Select
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from unittest.mock import AsyncMock
from io import BytesIO

from db.models import ServiceRequest, User, FileAttachment, Priority, RequestStatus, RequestType


@pytest.mark.asyncio
class TestFilesEndpoints:
    """Test file attachments CRUD endpoints."""

    async def test_get_files_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/files/requests/{request_id}."""
        # Create test request
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
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
            f"/support/files/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "files" in data
        assert isinstance(data["files"], list)

    async def test_upload_file_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test POST /support/files/requests/{request_id}."""
        # Create test request
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        # Mock MinIO upload
        mock_minio_service.upload_file.return_value = "attachments/test.pdf"

        # Create fake file
        file_content = b"fake pdf content"
        files = {
            "file": ("test.pdf", BytesIO(file_content), "application/pdf")
        }

        response = await async_client.post(
            f"/support/files/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
            files=files,
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "filePath" in data

    async def test_upload_multiple_files_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test POST /support/files/requests/{request_id}/bulk for multiple files."""
        # Create test request
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        # Mock MinIO upload
        mock_minio_service.upload_file.return_value = "attachments/test.pdf"

        # Create fake files
        files = [
            ("files", ("test1.pdf", BytesIO(b"file1"), "application/pdf")),
            ("files", ("test2.pdf", BytesIO(b"file2"), "application/pdf")),
        ]

        response = await async_client.post(
            f"/support/files/requests/{request.id}/bulk",
            headers={"Authorization": f"Bearer {test_user_token}"},
            files=files,
        )
        assert response.status_code == 201
        data = response.json()
        assert "files" in data
        assert isinstance(data["files"], list)

    async def test_get_file_by_id_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/files/{file_id}."""
        # Create test request and file
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        file_attachment = FileAttachment(
            request_id=request.id,
            file_path="attachments/test.pdf",
            file_name="test.pdf",
            file_size=2048,
            mime_type="application/pdf",
            uploaded_by=user.id,
        )
        db_session.add(file_attachment)
        await db_session.commit()
        await db_session.refresh(file_attachment)

        response = await async_client.get(
            f"/support/files/{file_attachment.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == file_attachment.id

    async def test_download_file_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test GET /support/files/{file_id}/download."""
        # Create test request and file
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        file_attachment = FileAttachment(
            request_id=request.id,
            file_path="attachments/test.pdf",
            file_name="test.pdf",
            file_size=2048,
            mime_type="application/pdf",
            uploaded_by=user.id,
        )
        db_session.add(file_attachment)
        await db_session.commit()
        await db_session.refresh(file_attachment)

        # Mock MinIO download
        mock_minio_service.download_file.return_value = BytesIO(b"fake pdf")

        response = await async_client.get(
            f"/support/files/{file_attachment.id}/download",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_delete_file_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test DELETE /support/files/{file_id}."""
        # Create test request and file
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        file_attachment = FileAttachment(
            request_id=request.id,
            file_path="attachments/test.pdf",
            file_name="test.pdf",
            file_size=2048,
            mime_type="application/pdf",
            uploaded_by=user.id,
        )
        db_session.add(file_attachment)
        await db_session.commit()
        await db_session.refresh(file_attachment)

        # Mock MinIO delete
        mock_minio_service.delete_file.return_value = True

        response = await async_client.delete(
            f"/support/files/{file_attachment.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_bulk_delete_files_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test DELETE /support/files/bulk."""
        # Create test request and files
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        file1 = FileAttachment(
            request_id=request.id,
            file_path="attachments/test1.pdf",
            file_name="test1.pdf",
            file_size=1024,
            mime_type="application/pdf",
            uploaded_by=user.id,
        )
        file2 = FileAttachment(
            request_id=request.id,
            file_path="attachments/test2.pdf",
            file_name="test2.pdf",
            file_size=2048,
            mime_type="application/pdf",
            uploaded_by=user.id,
        )
        db_session.add(file1)
        db_session.add(file2)
        await db_session.commit()
        await db_session.refresh(file1)
        await db_session.refresh(file2)

        # Mock MinIO delete
        mock_minio_service.delete_file.return_value = True

        payload = {"fileIds": [file1.id, file2.id]}

        response = await async_client.request(
            "DELETE",
            "/support/files/bulk",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200

    async def test_get_file_metadata_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/files/{file_id}/metadata."""
        # Create test request and file
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Files Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        file_attachment = FileAttachment(
            request_id=request.id,
            file_path="attachments/test.pdf",
            file_name="test.pdf",
            file_size=2048,
            mime_type="application/pdf",
            uploaded_by=user.id,
        )
        db_session.add(file_attachment)
        await db_session.commit()
        await db_session.refresh(file_attachment)

        response = await async_client.get(
            f"/support/files/{file_attachment.id}/metadata",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "fileName" in data
        assert "fileSize" in data
        assert "mimeType" in data

    async def test_unauthorized_access(
        self,
        async_client: AsyncClient,
    ):
        """Test files endpoints without authentication."""
        response = await async_client.get("/support/files/requests/1")
        assert response.status_code == 401
