"""Tests for search endpoints."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import Select
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from db.models import ServiceRequest, User, Priority, RequestStatus, RequestType


@pytest.mark.asyncio
class TestSearchEndpoints:
    """Test search endpoints."""

    async def test_search_requests_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/search/requests."""
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
            title="Searchable Request",
            description="This is a unique description for search",
            requester_id=user.id,
            priority_id=priority.id,
            status_id=status.id,
            request_type_id=request_type.id,
        )
        db_session.add(request)
        await db_session.commit()
        await db_session.refresh(request)

        response = await async_client.get(
            "/support/search/requests",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"query": "Searchable", "skip": 0, "limit": 10},
        )
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data
        assert isinstance(data["requests"], list)

    async def test_search_requests_empty_query(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/search/requests with empty query."""
        response = await async_client.get(
            "/support/search/requests",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"query": "", "skip": 0, "limit": 10},
        )
        assert response.status_code in [200, 400]

    async def test_search_requests_with_filters(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/search/requests with additional filters."""
        stmt = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        response = await async_client.get(
            "/support/search/requests",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={
                "query": "test",
                "priorityId": priority.id,
                "skip": 0,
                "limit": 10,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data

    async def test_advanced_search_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test POST /support/search/advanced."""
        stmt: Select[Any] = select(Priority).limit(1)
        priority = (await db_session.execute(stmt)).scalar_one()

        stmt = select(RequestStatus).limit(1)
        status = (await db_session.execute(stmt)).scalar_one()

        payload = {
            "query": "test",
            "priorityId": priority.id,
            "statusId": status.id,
            "dateFrom": "2024-01-01",
            "dateTo": "2024-12-31",
            "skip": 0,
            "limit": 10,
        }

        response = await async_client.post(
            "/support/search/advanced",
            headers={"Authorization": f"Bearer {test_user_token}"},
            json=payload,
        )
        assert response.status_code == 200
        data = response.json()
        assert "requests" in data
        assert isinstance(data["requests"], list)

    async def test_search_suggestions_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/search/suggestions."""
        response = await async_client.get(
            "/support/search/suggestions",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"query": "test"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data or isinstance(data, list)

    async def test_search_by_request_id_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
        db_session: AsyncSession,
    ):
        """Test GET /support/search/requests/by-id/{request_id}."""
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
            title="ID Search Test",
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
            f"/support/search/requests/by-id/{request.id}",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == request.id

    async def test_search_by_request_id_not_found(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/search/requests/by-id/{request_id} with non-existent ID."""
        response = await async_client.get(
            "/support/search/requests/by-id/99999",
            headers={"Authorization": f"Bearer {test_user_token}"},
        )
        assert response.status_code == 404

    async def test_global_search_success(
        self,
        async_client: AsyncClient,
        test_user_token: str,
    ):
        """Test GET /support/search/global."""
        response = await async_client.get(
            "/support/search/global",
            headers={"Authorization": f"Bearer {test_user_token}"},
            params={"query": "test", "skip": 0, "limit": 20},
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    async def test_unauthorized_access(
        self,
        async_client: AsyncClient,
    ):
        """Test search endpoints without authentication."""
        response = await async_client.get("/support/search/requests", params={"query": "test"})
        assert response.status_code == 401
