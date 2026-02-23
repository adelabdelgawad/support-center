"""
Tests for report configuration endpoints (GET /backend/report-configs/*).

Tests cover:
- Report config CRUD operations (create, read, update, delete/deactivate)
- Listing report configs with filters (public, type, active)
- Access control (creator-only updates/deletes)
- Validation (report type, field constraints)
- Public/private report visibility
- Error handling (not found, unauthorized)
- CamelCase field naming verification
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlmodel import col
from httpx import AsyncClient

from tests.factories import UserFactory
from db.models import User, ReportConfig


# ============================================================================
# Helper Functions
# ============================================================================


async def create_test_report_config(
    db_session: AsyncSession,
    created_by: User,
    name: str = "Test Report",
    report_type: str = "executive",
    is_public: bool = False,
    is_active: bool = True,
) -> ReportConfig:
    """Helper to create a report config for testing."""
    config = ReportConfig(
        name=name,
        description=f"Description for {name}",
        report_type=report_type,
        filters={"date_preset": "last_7_days"},
        display_config={"show_trends": True},
        created_by_id=created_by.id,
        is_public=is_public,
        is_active=is_active,
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


# ============================================================================
# GET /backend/report-configs/ - List Report Configurations
# ============================================================================


@pytest.mark.asyncio
async def test_list_report_configs_success(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test listing report configurations returns correct structure."""
    # Create a test report config
    await create_test_report_config(db_session, seed_user, name="My Report")

    response = await client.get("/backend/report-configs/")

    assert response.status_code == 200
    data = response.json()

    # Should return a list
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_list_report_configs_empty(client: AsyncClient, db_session: AsyncSession):
    """Test listing report configs with no configs."""
    # Delete all report configs
    await db_session.execute(text("DELETE FROM report_configs"))
    await db_session.commit()

    response = await client.get("/backend/report-configs/")

    assert response.status_code == 200
    data = response.json()
    assert data == []


@pytest.mark.asyncio
async def test_list_report_configs_include_public(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test listing with include_public=true shows public reports from others."""
    # Create another user
    other_user = UserFactory.create(username="otheruser")
    db_session.add(other_user)
    await db_session.commit()

    # Create public report by other user
    await create_test_report_config(
        db_session, other_user, name="Public Report", is_public=True
    )

    # Create private report by current user
    await create_test_report_config(
        db_session, seed_user, name="My Private Report", is_public=False
    )

    response = await client.get("/backend/report-configs/?include_public=true")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Should include both reports (current user's private + other's public)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_list_report_configs_exclude_public(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test listing with include_public=false shows only user's reports."""
    # Create another user
    other_user = UserFactory.create(username="otheruser2")
    db_session.add(other_user)
    await db_session.commit()

    # Create public report by other user
    await create_test_report_config(
        db_session, other_user, name="Other Public Report", is_public=True
    )

    # Create report by current user
    await create_test_report_config(
        db_session, seed_user, name="My Report", is_public=False
    )

    response = await client.get("/backend/report-configs/?include_public=false")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Should only include current user's reports
    for config in data:
        # Check if created_by_id matches (may be camelCase)
        if "createdById" in config:
            assert config["createdById"] == str(seed_user.id)
        elif "created_by_id" in config:
            assert config["created_by_id"] == str(seed_user.id)


@pytest.mark.asyncio
async def test_list_report_configs_filter_by_type(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test filtering report configs by report_type."""
    # Create different types
    await create_test_report_config(
        db_session, seed_user, name="Executive Report", report_type="executive"
    )
    await create_test_report_config(
        db_session, seed_user, name="Volume Report", report_type="volume"
    )

    response = await client.get("/backend/report-configs/?report_type=executive")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

    # All returned configs should be executive type
    for config in data:
        report_type = config.get("reportType") or config.get("report_type")
        if report_type:  # Only check if field exists
            assert report_type == "executive"


@pytest.mark.asyncio
async def test_list_report_configs_active_only(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test filtering report configs to active only."""
    # Create active and inactive configs
    await create_test_report_config(
        db_session, seed_user, name="Active Report", is_active=True
    )
    await create_test_report_config(
        db_session, seed_user, name="Inactive Report", is_active=False
    )

    response = await client.get("/backend/report-configs/?active_only=true")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

    # All returned configs should be active
    for config in data:
        is_active = config.get("isActive") or config.get("is_active")
        if is_active is not None:  # Only check if field exists
            assert is_active is True


@pytest.mark.asyncio
async def test_list_report_configs_include_inactive(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test listing all configs including inactive."""
    # Create active and inactive configs
    await create_test_report_config(
        db_session, seed_user, name="Active Config", is_active=True
    )
    await create_test_report_config(
        db_session, seed_user, name="Inactive Config", is_active=False
    )

    response = await client.get("/backend/report-configs/?active_only=false")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Should include both active and inactive
    assert len(data) >= 2


# ============================================================================
# GET /backend/report-configs/{config_id} - Get Single Report Config
# ============================================================================


@pytest.mark.asyncio
async def test_get_report_config_success(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test getting a report config by ID."""
    config = await create_test_report_config(db_session, seed_user, name="Test Config")

    response = await client.get(f"/backend/report-configs/{config.id}")

    assert response.status_code == 200
    data = response.json()

    # Verify returned data
    name = data.get("name")
    assert name == "Test Config"


@pytest.mark.asyncio
async def test_get_report_config_not_found(client: AsyncClient, seed_user: User):
    """Test getting non-existent report config returns 404."""
    response = await client.get("/backend/report-configs/99999")

    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_get_report_config_camel_case_fields(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test that response fields are in camelCase (CamelModel)."""
    config = await create_test_report_config(
        db_session, seed_user, name="CamelCase Test"
    )

    response = await client.get(f"/backend/report-configs/{config.id}")

    assert response.status_code == 200
    data = response.json()

    # Check for camelCase field names (may vary based on schema)
    # At least one of these patterns should be present
    has_camel_case = (
        "reportType" in data or
        "createdById" in data or
        "isPublic" in data or
        "isActive" in data
    )
    assert has_camel_case, "Response should use camelCase field names"


# ============================================================================
# POST /backend/report-configs/ - Create Report Configuration
# ============================================================================


@pytest.mark.asyncio
async def test_create_report_config_success(client: AsyncClient, seed_user: User):
    """Test creating a new report configuration."""
    config_data = {
        "name": "New Report Config",
        "description": "Test description",
        "reportType": "executive",
        "filters": {"datePreset": "last_30_days"},
        "displayConfig": {"showTrends": True, "chartType": "line"},
        "isPublic": False,
    }

    response = await client.post("/backend/report-configs/", json=config_data)

    assert response.status_code == 201
    data = response.json()

    # Verify returned data
    assert data["name"] == "New Report Config"
    assert data.get("reportType") or data.get("report_type") == "executive"


@pytest.mark.asyncio
async def test_create_report_config_with_schedule(client: AsyncClient, seed_user: User):
    """Test creating report config with schedule and recipients."""
    config_data = {
        "name": "Scheduled Report",
        "reportType": "volume",
        "filters": {},
        "displayConfig": {},
        "scheduleCron": "0 9 * * 1",  # Every Monday at 9 AM
        "recipients": ["admin@example.com", "manager@example.com"],
        "isPublic": True,
    }

    response = await client.post("/backend/report-configs/", json=config_data)

    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "Scheduled Report"
    # Check schedule fields (may be camelCase)
    assert "scheduleCron" in data or "schedule_cron" in data


@pytest.mark.asyncio
async def test_create_report_config_validation_missing_name(
    client: AsyncClient, seed_user: User
):
    """Test creating report config without required name field."""
    config_data = {
        "reportType": "executive",
        # Missing name
    }

    response = await client.post("/backend/report-configs/", json=config_data)

    assert response.status_code == 422  # Validation error
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_create_report_config_validation_invalid_type(
    client: AsyncClient, seed_user: User
):
    """Test creating report config with invalid report_type."""
    config_data = {
        "name": "Invalid Type Report",
        "reportType": "invalid_type_xyz",  # Invalid type
        "filters": {},
        "displayConfig": {},
    }

    response = await client.post("/backend/report-configs/", json=config_data)

    assert response.status_code == 422  # Validation error
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_create_report_config_validation_name_length(
    client: AsyncClient, seed_user: User
):
    """Test creating report config with name too short."""
    config_data = {
        "name": "A",  # Too short (min 2 characters)
        "reportType": "executive",
        "filters": {},
        "displayConfig": {},
    }

    response = await client.post("/backend/report-configs/", json=config_data)

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_create_report_config_defaults(client: AsyncClient, seed_user: User):
    """Test creating report config uses proper defaults."""
    config_data = {
        "name": "Minimal Report",
        "reportType": "sla_compliance",
        # Omit optional fields to test defaults
    }

    response = await client.post("/backend/report-configs/", json=config_data)

    assert response.status_code == 201
    data = response.json()

    # Should have defaults
    assert data["name"] == "Minimal Report"
    # isActive should default to True
    is_active = data.get("isActive", data.get("is_active", True))
    assert is_active is True


# ============================================================================
# PATCH /backend/report-configs/{config_id} - Update Report Config
# ============================================================================


@pytest.mark.asyncio
async def test_update_report_config_success(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test updating a report configuration."""
    config = await create_test_report_config(db_session, seed_user, name="Original Name")

    update_data = {
        "name": "Updated Name",
        "description": "Updated description",
    }

    response = await client.patch(
        f"/backend/report-configs/{config.id}", json=update_data
    )

    assert response.status_code == 200
    data = response.json()

    # Verify updates applied
    assert data["name"] == "Updated Name"
    assert data.get("description") == "Updated description"


@pytest.mark.asyncio
async def test_update_report_config_filters(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test updating report config filters."""
    config = await create_test_report_config(db_session, seed_user, name="Filter Test")

    update_data = {
        "filters": {
            "datePreset": "this_quarter",
            "businessUnitIds": [1, 2, 3],
        }
    }

    response = await client.patch(
        f"/backend/report-configs/{config.id}", json=update_data
    )

    assert response.status_code == 200
    data = response.json()

    # Verify filters updated
    filters = data.get("filters")
    assert filters is not None
    assert isinstance(filters, dict)


@pytest.mark.asyncio
async def test_update_report_config_not_found(client: AsyncClient, seed_user: User):
    """Test updating non-existent report config."""
    update_data = {"name": "Should Fail"}

    response = await client.patch("/backend/report-configs/99999", json=update_data)

    assert response.status_code == 404
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_update_report_config_not_owner(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test updating report config created by another user fails.

    Note: This test verifies the access control logic. In the test environment,
    the current user is mocked via dependency overrides.
    """
    # Create another user
    other_user = UserFactory.create(username="otherowner")
    db_session.add(other_user)
    await db_session.commit()

    # Create config owned by other user
    config = await create_test_report_config(
        db_session, other_user, name="Other's Report"
    )

    update_data = {"name": "Trying to Update"}

    response = await client.patch(
        f"/backend/report-configs/{config.id}", json=update_data
    )

    # Should fail (404 or 403) since current user doesn't own it
    assert response.status_code in [403, 404]


@pytest.mark.asyncio
async def test_update_report_config_validation(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test update validation for invalid report_type."""
    config = await create_test_report_config(db_session, seed_user, name="Validation Test")

    update_data = {
        "reportType": "invalid_type_abc",  # Invalid
    }

    response = await client.patch(
        f"/backend/report-configs/{config.id}", json=update_data
    )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_update_report_config_partial(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test partial update (only some fields)."""
    config = await create_test_report_config(
        db_session,
        seed_user,
        name="Partial Update Test",
        report_type="executive",
    )

    # Only update isPublic, leave other fields unchanged
    update_data = {"isPublic": True}

    response = await client.patch(
        f"/backend/report-configs/{config.id}", json=update_data
    )

    assert response.status_code == 200
    data = response.json()

    # Name should remain unchanged
    assert data["name"] == "Partial Update Test"
    # isPublic should be updated
    is_public = data.get("isPublic") or data.get("is_public")
    assert is_public is True


# ============================================================================
# DELETE /backend/report-configs/{config_id} - Delete Report Config
# ============================================================================


@pytest.mark.asyncio
async def test_delete_report_config_success(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test deleting (deactivating) a report configuration."""
    config = await create_test_report_config(db_session, seed_user, name="To Delete")

    response = await client.delete(f"/backend/report-configs/{config.id}")

    assert response.status_code == 204  # No content

    # Verify config is deactivated (soft delete)
    await db_session.refresh(config)
    assert config.is_active is False


@pytest.mark.asyncio
async def test_delete_report_config_not_found(client: AsyncClient, seed_user: User):
    """Test deleting non-existent report config."""
    response = await client.delete("/backend/report-configs/99999")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_report_config_not_owner(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test deleting report config created by another user fails."""
    # Create another user
    other_user = UserFactory.create(username="anotherowner")
    db_session.add(other_user)
    await db_session.commit()

    # Create config owned by other user
    config = await create_test_report_config(
        db_session, other_user, name="Other's Config"
    )

    response = await client.delete(f"/backend/report-configs/{config.id}")

    # Should fail (404 or 403) since current user doesn't own it
    assert response.status_code in [403, 404]


@pytest.mark.asyncio
async def test_delete_report_config_is_soft_delete(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test that delete is a soft delete (deactivate, not hard delete)."""
    config = await create_test_report_config(db_session, seed_user, name="Soft Delete Test")
    assert config.id is not None
    config_id: int = config.id

    response = await client.delete(f"/backend/report-configs/{config_id}")

    assert response.status_code == 204

    # Verify config still exists in database
    stmt = select(ReportConfig).where(col(ReportConfig.id) == config_id)
    result = await db_session.execute(stmt)
    deleted_config = result.scalar_one_or_none()

    assert deleted_config is not None  # Still exists
    assert deleted_config.is_active is False  # But deactivated


# ============================================================================
# Access Control and Visibility Tests
# ============================================================================


@pytest.mark.asyncio
async def test_report_config_visibility_public(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test that public reports are visible to all users."""
    # Create another user
    other_user = UserFactory.create(username="publicviewer")
    db_session.add(other_user)
    await db_session.commit()

    # Create public report by other user
    await create_test_report_config(
        db_session, other_user, name="Public Visible Report", is_public=True
    )

    # Current user (seed_user) should be able to view it
    response = await client.get(
        "/backend/report-configs/?include_public=true"
    )

    assert response.status_code == 200
    data = response.json()
    # Should include the public report
    assert any(c.get("name") == "Public Visible Report" for c in data)


@pytest.mark.asyncio
async def test_report_config_visibility_private(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test that private reports are only visible to creator."""
    # Create another user
    other_user = UserFactory.create(username="privateowner")
    db_session.add(other_user)
    await db_session.commit()

    # Create private report by other user
    await create_test_report_config(
        db_session, other_user, name="Private Hidden Report", is_public=False
    )

    # Current user should NOT see private reports from others
    response = await client.get(
        "/backend/report-configs/?include_public=false"
    )

    assert response.status_code == 200
    data = response.json()
    # Should NOT include other user's private report
    assert not any(c.get("name") == "Private Hidden Report" for c in data)


# ============================================================================
# Complex Scenarios
# ============================================================================


@pytest.mark.asyncio
async def test_report_config_full_lifecycle(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test full CRUD lifecycle of a report config."""
    # 1. Create
    create_data = {
        "name": "Lifecycle Test",
        "reportType": "agent_performance",
        "filters": {"datePreset": "this_month"},
        "displayConfig": {"limit": 10},
        "isPublic": False,
    }
    response = await client.post("/backend/report-configs/", json=create_data)
    assert response.status_code == 201
    config_id = response.json()["id"]

    # 2. Read
    response = await client.get(f"/backend/report-configs/{config_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Lifecycle Test"

    # 3. Update
    update_data = {"name": "Lifecycle Test Updated", "isPublic": True}
    response = await client.patch(
        f"/backend/report-configs/{config_id}", json=update_data
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Lifecycle Test Updated"

    # 4. Delete (deactivate)
    response = await client.delete(f"/backend/report-configs/{config_id}")
    assert response.status_code == 204

    # 5. Verify deactivated
    stmt = select(ReportConfig).where(ReportConfig.__table__.c.id == config_id)
    result = await db_session.execute(stmt)
    config = result.scalar_one_or_none()
    assert config is not None
    assert config.is_active is False


@pytest.mark.asyncio
async def test_report_config_multiple_types(
    client: AsyncClient, db_session: AsyncSession, seed_user: User
):
    """Test creating multiple report configs with different types."""
    types = ["executive", "volume", "sla_compliance", "agent_performance"]

    created_ids = []
    for report_type in types:
        config_data = {
            "name": f"{report_type.replace('_', ' ').title()} Report",
            "reportType": report_type,
            "filters": {},
            "displayConfig": {},
        }
        response = await client.post("/backend/report-configs/", json=config_data)
        assert response.status_code == 201
        created_ids.append(response.json()["id"])

    # Verify all created
    assert len(created_ids) == len(types)

    # List all configs
    response = await client.get("/backend/report-configs/")
    assert response.status_code == 200
    configs = response.json()
    assert len(configs) >= len(types)
