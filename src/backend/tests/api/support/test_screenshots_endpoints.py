"""Tests for screenshots endpoints."""

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from unittest.mock import AsyncMock
from io import BytesIO

from db.models import ServiceRequest, User, Screenshot, Priority, RequestStatus, RequestType


@pytest.mark.asyncio
class TestScreenshotsEndpoints:
    """Test screenshots CRUD endpoints."""

    async def test_get_screenshots_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/screenshots/requests/{request_id}."""
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
            title="Screenshot Test",
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
            f"/support/screenshots/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "screenshots" in data
        assert isinstance(data["screenshots"], list)

    async def test_upload_screenshot_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test POST /support/screenshots/requests/{request_id}."""
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
            title="Screenshot Test",
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
        mock_minio_service.upload_file.return_value = "screenshots/test.png"

        # Create fake image file
        file_content = b"fake image content"
        files = {
            "file": ("test.png", BytesIO(file_content), "image/png")
        }

        response = await async_client.post(
            f"/support/screenshots/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
            files=files,
        )
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "filePath" in data

    async def test_upload_screenshot_invalid_file_type(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test POST /support/screenshots/requests/{request_id} with invalid file type."""
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
            title="Screenshot Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        # Create fake text file
        file_content = b"not an image"
        files = {
            "file": ("test.txt", BytesIO(file_content), "text/plain")
        }

        response = await async_client.post(
            f"/support/screenshots/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
            files=files,
        )
        assert response.status_code in [400, 422]

    async def test_get_screenshot_by_id_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/screenshots/{screenshot_id}."""
        # Create test request and screenshot
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Screenshot Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        screenshot = Screenshot(
            request_id=request.id,
            file_path="screenshots/test.png",
            file_name="test.png",
            file_size=1024,
            uploaded_by=user.id,
        )
        db_session.add(screenshot)
        await db_session.commit()
        await db_session.refresh(screenshot)

        response = await async_client.get(
            f"/support/screenshots/{screenshot.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == screenshot.id

    async def test_download_screenshot_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test GET /support/screenshots/{screenshot_id}/download."""
        # Create test request and screenshot
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Screenshot Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        screenshot = Screenshot(
            request_id=request.id,
            file_path="screenshots/test.png",
            file_name="test.png",
            file_size=1024,
            uploaded_by=user.id,
        )
        db_session.add(screenshot)
        await db_session.commit()
        await db_session.refresh(screenshot)

        # Mock MinIO download
        mock_minio_service.download_file.return_value = BytesIO(b"fake image")

        response = await async_client.get(
            f"/support/screenshots/{screenshot.id}/download",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_delete_screenshot_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test DELETE /support/screenshots/{screenshot_id}."""
        # Create test request and screenshot
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Screenshot Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        screenshot = Screenshot(
            request_id=request.id,
            file_path="screenshots/test.png",
            file_name="test.png",
            file_size=1024,
            uploaded_by=user.id,
        )
        db_session.add(screenshot)
        await db_session.commit()
        await db_session.refresh(screenshot)

        # Mock MinIO delete
        mock_minio_service.delete_file.return_value = True

        response = await async_client.delete(
            f"/support/screenshots/{screenshot.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

    async def test_bulk_delete_screenshots_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
        mock_minio_service: AsyncMock,
    ):
        """Test DELETE /support/screenshots/bulk."""
        # Create test request and screenshots
        stmt = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Screenshot Test",
            description="Test",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        screenshot1 = Screenshot(
            request_id=request.id,
            file_path="screenshots/test1.png",
            file_name="test1.png",
            file_size=1024,
            uploaded_by=user.id,
        )
        screenshot2 = Screenshot(
            request_id=request.id,
            file_path="screenshots/test2.png",
            file_name="test2.png",
            file_size=2048,
            uploaded_by=user.id,
        )
        db_session.add(screenshot1)
        db_session.add(screenshot2)
        await db_session.commit()
        await db_session.refresh(screenshot1)
        await db_session.refresh(screenshot2)

        # Mock MinIO delete
        mock_minio_service.delete_file.return_value = True

        payload = {"screenshotIds": [screenshot1.id, screenshot2.id]}

        response = await async_client.delete(
            "/support/screenshots/bulk",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200

    async def test_unauthorized_access(
        self,
        async_client: AsyncClient,
    ):
        """Test screenshots endpoints without authentication."""
        response = await async_client.get("/support/screenshots/requests/1")
        assert response.status_code == 401
