"""Tests for service requests endpoints."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import Select
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import ServiceRequest, User, Priority, RequestStatus, RequestType


@pytest.mark.asyncio
class TestRequestsEndpoints:
    """Test service requests CRUD endpoints."""

    async def test_get_requests_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/requests/ returns paginated requests."""
        response = await async_client.get(
            "/support/requests/",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"skip": 0, "limit": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data
        assert "total" in data
        assert isinstance(data["requests"], list)

    async def test_get_requests_with_filters(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/requests/ with status filter."""
        response = await async_client.get(
            "/support/requests/",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"status": "open", "skip": 0, "limit": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data

    async def test_get_requests_assigned_to_me(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/requests/assigned-to-me."""
        response = await async_client.get(
            "/support/requests/assigned-to-me",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"skip": 0, "limit": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data
        assert "total" in data

    async def test_get_requests_created_by_me(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/requests/created-by-me."""
        response = await async_client.get(
            "/support/requests/created-by-me",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"skip": 0, "limit": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data
        assert "total" in data

    async def test_get_request_by_id_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/requests/{request_id}."""
        # Create a test request
        stmt: Select[Any] = select(User).limit(1)
        user = (await db_session.execute(stmt)).scalar_one()

        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        request = ServiceRequest(
            title="Test Request",
            description="Test Description",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.get(
            f"/support/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == request.id
        assert data["title"] == "Test Request"

    async def test_get_request_by_id_not_found(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/requests/{request_id} with non-existent ID."""
        response = await async_client.get(
            "/support/requests/99999",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 404

    async def test_create_request_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test POST /support/requests/ creates new request."""
        stmt: Select[Any] = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestType).limit(1)
        request_type = (await db_session.execute(stmt)).scalar_one()

        payload = {
            "title": "New Test Request",
            "description": "New Test Description",
            "priorityId": priority.id,
            "requestTypeId": request_type.id,
        }

        response = await async_client.post(
            "/support/requests/",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "New Test Request"
        assert "id" in data

    async def test_create_request_missing_fields(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test POST /support/requests/ with missing required fields."""
        payload = {"title": "Incomplete Request"}

        response = await async_client.post(
            "/support/requests/",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 422

    async def test_update_request_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test PUT /support/requests/{request_id} updates request."""
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
            title="Original Title",
            description="Original Description",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        payload = {
            "title": "Updated Title",
            "description": "Updated Description",
        }

        response = await async_client.put(
            f"/support/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["description"] == "Updated Description"

    async def test_update_request_not_found(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test PUT /support/requests/{request_id} with non-existent ID."""
        payload = {"title": "Updated Title"}

        response = await async_client.put(
            "/support/requests/99999",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 404

    async def test_delete_request_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test DELETE /support/requests/{request_id}."""
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
            title="To Delete",
            description="Delete Me",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.delete(
            f"/support/requests/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200

        # Verify deletion
        stmt = select(ServiceRequest).where(ServiceRequest.id == request.id)
        deleted = (await db_session.execute(stmt)).scalar_one_or_none()
        assert deleted is None

    async def test_delete_request_not_found(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test DELETE /support/requests/{request_id} with non-existent ID."""
        response = await async_client.delete(
            "/support/requests/99999",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 404

    async def test_assign_request_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test PUT /support/requests/{request_id}/assign."""
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
            title="To Assign",
            description="Assign Me",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        payload = {"assignedToId": str(user.id)}

        response = await async_client.put(
            f"/support/requests/{request.id}/assign",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["assignedToId"] == str(user.id)

    async def test_update_request_status_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test PUT /support/requests/{request_id}/status."""
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
            title="Status Test",
            description="Update My Status",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        # Get another status
        stmt = select(RequestStatus).where(RequestStatus.id != status.id).limit(1)
        new_status = (await db_session.execute(stmt)).scalar_one_or_none()

        if new_status:
            payload = {"statusId": new_status.id}

            response = await async_client.put(
                f"/support/requests/{request.id}/status",
                headers={"Authorization": f"Bearer {test_user_token}"},
                json=payload,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["statusId"] == new_status.id

    async def test_update_request_priority_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test PUT /support/requests/{request_id}/priority."""
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
            title="Priority Test",
            description="Update My Priority",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        # Get another priority
        stmt = select(Priority).where(Priority.id != priority.id).limit(1)
        new_priority = (await db_session.execute(stmt)).scalar_one_or_none()

        if new_priority:
            payload = {"priorityId": new_priority.id}

            response = await async_client.put(
                f"/support/requests/{request.id}/priority",
                headers={"Authorization": f"Bearer {test_user_token}"},
                json=payload,
            )
            assert response.status_code == 200
            data = response.json()
            assert data["priorityId"] == new_priority.id

    async def test_get_request_timeline_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/requests/{request_id}/timeline."""
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
            title="Timeline Test",
            description="Timeline",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.get(
            f"/support/requests/{request.id}/timeline",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    async def test_get_request_statistics_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/requests/statistics."""
        response = await async_client.get(
            "/support/requests/statistics",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data or "statistics" in data

    async def test_unauthorized_access(
        self,
        async_client: AsyncClient,
    ):
        """Test requests endpoints without authentication."""
        response = await async_client.get("/support/requests/")
        assert response.status_code == 401
