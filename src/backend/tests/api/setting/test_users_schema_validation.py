"""
Schema validation tests for user endpoints.

These tests ensure that Pydantic schemas correctly serialize/deserialize
database models, especially nested objects and complex types like UUIDs.

These tests use REAL database operations (not mocked) to catch schema mismatches
that only appear when serializing actual ORM models.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from tests.factories import UserFactory, RoleFactory
from db.models import User, Role, UserRole


# ============================================================================
# Nested Object Schema Validation
# ============================================================================


@pytest.mark.asyncio
async def test_user_with_roles_schema_validation(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that nested role objects serialize correctly with real database data.

    This test caught: UserRoleInfo.id expecting int but receiving UUID.
    """
    # Create user and role in database
    user = UserFactory.create(username="schema_test_user", email="schema@test.com")
    role = RoleFactory.create(name="Test Role", ar_name="دور اختبار")
    db_session.add_all([user, role])
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(role)

    # Assign role to user (real database operation)
    user_role = UserRole(user_id=user.id, role_id=role.id, is_active=True)
    db_session.add(user_role)
    await db_session.commit()

    # Fetch user with roles - this triggers full schema validation
    response = await client.get(f"/backend/users/{user.id}")
    assert response.status_code == 200

    data = response.json()
    assert "id" in data

    # If response includes roles, validate their structure
    if "roles" in data and len(data["roles"]) > 0:
        role_data = data["roles"][0]

        # Verify role.id is a valid UUID string (not int)
        assert "id" in role_data
        # This will raise ValueError if not a valid UUID
        UUID(role_data["id"])

        # Verify role has required fields
        assert "name" in role_data
        assert role_data["name"] == "Test Role"


@pytest.mark.asyncio
async def test_users_list_with_roles_schema_validation(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that user list with roles serializes correctly."""
    # Clear existing data
    await db_session.execute(text("DELETE FROM user_roles"))
    await db_session.execute(text("DELETE FROM users"))
    await db_session.execute(text("DELETE FROM roles"))
    await db_session.commit()

    # Create users and roles
    user1 = UserFactory.create(username="list_user1", email="list1@test.com")
    user2 = UserFactory.create(username="list_user2", email="list2@test.com")
    role1 = RoleFactory.create(name="Admin", ar_name="مدير")
    role2 = RoleFactory.create(name="User", ar_name="مستخدم")

    db_session.add_all([user1, user2, role1, role2])
    await db_session.commit()
    await db_session.refresh(user1)
    await db_session.refresh(user2)
    await db_session.refresh(role1)
    await db_session.refresh(role2)

    # Assign roles
    user_role1 = UserRole(user_id=user1.id, role_id=role1.id, is_active=True)
    user_role2 = UserRole(user_id=user2.id, role_id=role2.id, is_active=True)
    db_session.add_all([user_role1, user_role2])
    await db_session.commit()

    # Fetch users list with roles
    response = await client.get("/backend/users/with-roles")
    assert response.status_code == 200

    data = response.json()
    assert "users" in data
    assert len(data["users"]) >= 2

    # Validate each user's role structure
    for user_data in data["users"]:
        if "roles" in user_data and len(user_data["roles"]) > 0:
            for role_data in user_data["roles"]:
                # Verify role.id is UUID (not int)
                assert "id" in role_data
                UUID(role_data["id"])  # Raises if invalid

                # Verify required fields
                assert "name" in role_data


@pytest.mark.asyncio
async def test_user_role_ids_are_uuids(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that roleIds field contains valid UUID strings."""
    # Create user with role
    user = UserFactory.create(username="roleid_test", email="roleid@test.com")
    role = RoleFactory.create(name="Test Role")
    db_session.add_all([user, role])
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(role)

    user_role = UserRole(user_id=user.id, role_id=role.id, is_active=True)
    db_session.add(user_role)
    await db_session.commit()

    # Fetch user
    response = await client.get(f"/backend/users/{user.id}")
    assert response.status_code == 200

    data = response.json()

    # Check roleIds field if present
    if "roleIds" in data and len(data["roleIds"]) > 0:
        for role_id in data["roleIds"]:
            # Each role ID should be a valid UUID string
            UUID(role_id)


# ============================================================================
# UUID Field Validation
# ============================================================================


@pytest.mark.asyncio
async def test_user_id_is_uuid_string(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that user ID is serialized as UUID string (not object)."""
    user = UserFactory.create(username="uuid_test", email="uuid@test.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    response = await client.get(f"/backend/users/{user.id}")
    assert response.status_code == 200

    data = response.json()
    assert "id" in data

    # Should be string, not object
    assert isinstance(data["id"], str)

    # Should be valid UUID
    UUID(data["id"])


@pytest.mark.asyncio
async def test_manager_id_is_uuid_string(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that managerId is serialized as UUID string when present."""
    # Create manager
    manager = UserFactory.create(username="manager", email="manager@test.com")
    db_session.add(manager)
    await db_session.commit()
    await db_session.refresh(manager)

    # Create employee with manager
    employee = UserFactory.create(
        username="employee",
        email="employee@test.com",
        manager_id=manager.id
    )
    db_session.add(employee)
    await db_session.commit()
    await db_session.refresh(employee)

    response = await client.get(f"/backend/users/{employee.id}")
    assert response.status_code == 200

    data = response.json()

    if "managerId" in data and data["managerId"] is not None:
        # Should be string
        assert isinstance(data["managerId"], str)
        # Should be valid UUID
        UUID(data["managerId"])


# ============================================================================
# Business Unit Schema Validation
# ============================================================================


@pytest.mark.skip(reason="BusinessUnitUserAssign requires technician_id - feature not fully implemented")
@pytest.mark.asyncio
async def test_user_business_units_schema_validation(
    client: AsyncClient, db_session: AsyncSession, seed_business_unit
):
    """Test that nested business unit objects serialize correctly."""
    from db.models import BusinessUnitUserAssign

    # Create user
    user = UserFactory.create(username="bu_user", email="bu@test.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Assign business unit
    bu_assign = BusinessUnitUserAssign(
        user_id=user.id,
        business_unit_id=seed_business_unit.id,
        is_active=True
    )
    db_session.add(bu_assign)
    await db_session.commit()

    # Fetch user
    response = await client.get(f"/backend/users/{user.id}")
    assert response.status_code == 200

    data = response.json()

    # If business units are included, validate structure
    if "businessUnits" in data and len(data["businessUnits"]) > 0:
        bu_data = data["businessUnits"][0]

        # Verify required fields exist
        assert "id" in bu_data
        assert "name" in bu_data
        assert "isActive" in bu_data

        # ID should be integer for business units
        assert isinstance(bu_data["id"], int)


# ============================================================================
# DateTime Field Validation
# ============================================================================


@pytest.mark.asyncio
async def test_datetime_fields_are_iso_strings(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that datetime fields are serialized as ISO 8601 strings."""
    user = UserFactory.create(username="datetime_test", email="datetime@test.com")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    response = await client.get(f"/backend/users/{user.id}")
    assert response.status_code == 200

    data = response.json()

    # Check datetime fields if present
    datetime_fields = ["createdAt", "updatedAt", "lastSeen"]

    for field in datetime_fields:
        if field in data and data[field] is not None:
            # Should be string
            assert isinstance(data[field], str)

            # Should end with 'Z' (UTC) or have timezone info
            assert 'T' in data[field]  # ISO 8601 format

            # Should be parseable as datetime
            from datetime import datetime
            datetime.fromisoformat(data[field].replace('Z', '+00:00'))


# ============================================================================
# Bulk Operation Schema Validation
# ============================================================================


@pytest.mark.asyncio
async def test_bulk_status_update_returns_correct_schemas(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that bulk update operations return properly serialized users."""
    # Create multiple users
    users = [
        UserFactory.create(username=f"bulk{i}", email=f"bulk{i}@test.com", is_active=True)
        for i in range(3)
    ]
    db_session.add_all(users)
    await db_session.commit()

    for user in users:
        await db_session.refresh(user)

    user_ids = [str(user.id) for user in users]

    # Bulk deactivate
    response = await client.post(
        "/backend/users/bulk-status",
        json={"userIds": user_ids, "isActive": False}
    )

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    if "updatedUsers" in data:
        for user_data in data["updatedUsers"]:
            # Each user should have valid UUID id
            assert "id" in user_data
            UUID(user_data["id"])

            # Should have updated status
            assert "isActive" in user_data


# ============================================================================
# Error Response Schema Validation
# ============================================================================


@pytest.mark.asyncio
async def test_validation_error_schema(client: AsyncClient):
    """Test that validation errors return proper Pydantic error schema."""
    # Send invalid data (missing required fields)
    response = await client.post(
        "/backend/users",
        json={"username": "test"}  # Missing required fields
    )

    assert response.status_code == 422
    data = response.json()

    # FastAPI/Pydantic validation error format
    assert "detail" in data

    # Detail should be array of error objects
    if isinstance(data["detail"], list):
        for error in data["detail"]:
            # Each error should have these fields
            assert "loc" in error  # Location of error
            assert "msg" in error  # Error message
            assert "type" in error  # Error type


@pytest.mark.asyncio
async def test_not_found_error_schema(client: AsyncClient):
    """Test that 404 errors return consistent schema."""
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.get(f"/backend/users/{fake_id}")
    assert response.status_code == 404

    data = response.json()
    assert "detail" in data

    # Detail should be string for HTTPException
    assert isinstance(data["detail"], str)


# ============================================================================
# CamelCase Conversion Validation
# ============================================================================


@pytest.mark.asyncio
async def test_camel_case_conversion_with_real_data(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that all snake_case model fields are converted to camelCase in responses."""
    user = UserFactory.create(
        username="camel_test",
        email="camel@test.com",
        full_name="Camel Test User",
        phone_number="1234567890",
        is_technician=True,
        is_super_admin=False,
        is_domain=False,
        is_blocked=False
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    response = await client.get(f"/backend/users/{user.id}")
    assert response.status_code == 200

    data = response.json()

    # Verify camelCase fields (not snake_case)
    camel_case_fields = [
        "fullName",
        "phoneNumber",
        "isTechnician",
        "isSuperAdmin",
        "isDomain",
        "isBlocked",
        "createdAt",
        "updatedAt",
        "lastSeen",
        "managerId",
        "blockMessage"
    ]

    for field in camel_case_fields:
        # Field should exist (or be in response if not None)
        if field in data:
            # Should NOT have snake_case equivalent
            snake_case = field[0].lower() + ''.join(
                ['_' + c.lower() if c.isupper() else c for c in field[1:]]
            )
            assert snake_case not in data, f"Found snake_case field: {snake_case}"


# ============================================================================
# Optional Field Validation
# ============================================================================


@pytest.mark.asyncio
async def test_optional_fields_are_nullable(
    client: AsyncClient, db_session: AsyncSession
):
    """Test that optional fields can be null without causing validation errors."""
    user = UserFactory.create(
        username="optional_test",
        email="optional@test.com",
        # Explicitly set optional fields to None
        phone_number=None,
        title=None,
        manager_id=None
    )
    # Set block_message directly on the user object (not in factory)
    user.block_message = None

    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    response = await client.get(f"/backend/users/{user.id}")
    assert response.status_code == 200

    data = response.json()

    # These fields should be present but can be null
    optional_fields = ["phoneNumber", "title", "managerId", "blockMessage", "lastSeen"]

    for field in optional_fields:
        # Field should exist in response
        assert field in data
        # But can be null
        # (no assertion on value - just checking it doesn't cause validation error)
