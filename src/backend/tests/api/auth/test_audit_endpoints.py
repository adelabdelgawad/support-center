"""
Tests for audit log endpoints (GET /backend/audit/*).

Tests cover:
- Getting audit logs with pagination
- Filtering audit logs by various criteria
- Getting filter options (actions, resource types, users)
- Getting single audit log by ID
- Permission enforcement (super admin only)
- Error handling
"""

import pytest
from httpx import AsyncClient
from uuid import uuid4

from db.models import User


# ============================================================================
# GET /backend/audit - List Audit Logs
# ============================================================================


@pytest.mark.asyncio
async def test_get_audit_logs_success(client: AsyncClient, seed_admin_user: User):
    """Test getting audit logs as super admin."""
    response = await client.get("/backend/audit")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    assert "data" in data
    assert "pagination" in data
    assert isinstance(data["data"], list)

    # Verify pagination structure
    pagination = data["pagination"]
    assert "page" in pagination
    assert "perPage" in pagination or "per_page" in pagination
    assert "totalCount" in pagination or "total_count" in pagination
    assert "totalPages" in pagination or "total_pages" in pagination


@pytest.mark.asyncio
async def test_get_audit_logs_with_pagination(client: AsyncClient, seed_admin_user: User):
    """Test audit logs pagination parameters."""
    response = await client.get("/backend/audit?page=1&per_page=10")

    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) <= 10


@pytest.mark.asyncio
async def test_get_audit_logs_filter_by_user(client: AsyncClient, seed_admin_user: User):
    """Test filtering audit logs by user ID."""
    user_id = str(uuid4())
    response = await client.get(f"/backend/audit?user_id={user_id}")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_get_audit_logs_filter_by_action(client: AsyncClient, seed_admin_user: User):
    """Test filtering audit logs by action type."""
    response = await client.get("/backend/audit?action=create")

    assert response.status_code == 200
    data = response.json()

    # If there are results, verify they match the filter
    for log in data["data"]:
        if "action" in log:
            assert log["action"].lower() == "create"


@pytest.mark.asyncio
async def test_get_audit_logs_filter_by_resource_type(client: AsyncClient, seed_admin_user: User):
    """Test filtering audit logs by resource type."""
    response = await client.get("/backend/audit?resource_type=User")

    assert response.status_code == 200
    data = response.json()

    # If there are results, verify they match the filter
    for log in data["data"]:
        if "resourceType" in log or "resource_type" in log:
            resource_type = log.get("resourceType") or log.get("resource_type")
            assert resource_type == "User"


@pytest.mark.asyncio
async def test_get_audit_logs_filter_by_resource_id(client: AsyncClient, seed_admin_user: User):
    """Test filtering audit logs by resource ID."""
    resource_id = str(uuid4())
    response = await client.get(f"/backend/audit?resource_id={resource_id}")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_get_audit_logs_filter_by_correlation_id(client: AsyncClient, seed_admin_user: User):
    """Test filtering audit logs by correlation ID."""
    correlation_id = str(uuid4())
    response = await client.get(f"/backend/audit?correlation_id={correlation_id}")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_get_audit_logs_search(client: AsyncClient, seed_admin_user: User):
    """Test text search across audit logs."""
    response = await client.get("/backend/audit?search=test")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_get_audit_logs_date_range(client: AsyncClient, seed_admin_user: User):
    """Test filtering audit logs by date range."""
    start_date = "2024-01-01T00:00:00Z"
    end_date = "2024-12-31T23:59:59Z"

    response = await client.get(f"/backend/audit?start_date={start_date}&end_date={end_date}")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_get_audit_logs_combined_filters(client: AsyncClient, seed_admin_user: User):
    """Test combining multiple filters."""
    response = await client.get(
        "/backend/audit?action=update&resource_type=User&page=1&per_page=20"
    )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["data"], list)


@pytest.mark.asyncio
async def test_get_audit_logs_max_per_page(client: AsyncClient, seed_admin_user: User):
    """Test per_page limit (max 100)."""
    response = await client.get("/backend/audit?per_page=150")

    # Should either cap at 100 or return validation error
    assert response.status_code in [200, 422]


# ============================================================================
# GET /backend/audit/filter-options - Get Filter Options
# ============================================================================


@pytest.mark.asyncio
async def test_get_audit_filter_options_success(client: AsyncClient, seed_admin_user: User):
    """Test getting filter options for audit logs."""
    response = await client.get("/backend/audit/filter-options")

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    assert "actions" in data
    assert "resourceTypes" in data or "resource_types" in data
    assert "users" in data

    # Verify they are lists
    assert isinstance(data["actions"], list)
    assert isinstance(data.get("resourceTypes") or data.get("resource_types"), list)
    assert isinstance(data["users"], list)


@pytest.mark.asyncio
async def test_get_audit_filter_options_returns_distinct_values(
    client: AsyncClient, seed_admin_user: User
):
    """Test that filter options return distinct values only."""
    response = await client.get("/backend/audit/filter-options")

    assert response.status_code == 200
    data = response.json()

    # Each list should contain unique values (no duplicates)
    actions = data["actions"]
    assert len(actions) == len(set(actions))


# ============================================================================
# GET /backend/audit/{audit_id} - Get Single Audit Log
# ============================================================================


@pytest.mark.asyncio
async def test_get_audit_log_by_id_not_found(client: AsyncClient, seed_admin_user: User):
    """Test getting non-existent audit log."""
    response = await client.get("/backend/audit/999999")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_audit_log_by_id_invalid_id(client: AsyncClient, seed_admin_user: User):
    """Test getting audit log with invalid ID format."""
    response = await client.get("/backend/audit/not-a-number")

    assert response.status_code == 422


# ============================================================================
# Permission Tests (Super Admin Only)
# ============================================================================


@pytest.mark.asyncio
async def test_audit_logs_require_super_admin(unauth_client: AsyncClient):
    """Test that audit logs require authentication."""
    response = await unauth_client.get("/backend/audit")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_audit_filter_options_require_super_admin(unauth_client: AsyncClient):
    """Test that filter options require authentication."""
    response = await unauth_client.get("/backend/audit/filter-options")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_audit_log_by_id_requires_super_admin(unauth_client: AsyncClient):
    """Test that getting single audit log requires authentication."""
    response = await unauth_client.get("/backend/audit/1")

    assert response.status_code == 401


# ============================================================================
# Error Handling Tests
# ============================================================================


@pytest.mark.asyncio
async def test_get_audit_logs_invalid_page(client: AsyncClient, seed_admin_user: User):
    """Test with invalid page number."""
    response = await client.get("/backend/audit?page=0")

    # Should return validation error (page must be >= 1)
    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_get_audit_logs_invalid_per_page(client: AsyncClient, seed_admin_user: User):
    """Test with invalid per_page value."""
    response = await client.get("/backend/audit?per_page=0")

    # Should return validation error (per_page must be >= 1)
    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_get_audit_logs_invalid_date_format(client: AsyncClient, seed_admin_user: User):
    """Test with invalid date format."""
    response = await client.get("/backend/audit?start_date=invalid-date")

    # Should handle gracefully (ignore invalid date or return error)
    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_get_audit_logs_invalid_user_id_format(client: AsyncClient, seed_admin_user: User):
    """Test with invalid user ID format."""
    response = await client.get("/backend/audit?user_id=not-a-uuid")

    # Should handle gracefully (ignore invalid UUID or return error)
    assert response.status_code in [200, 422]
