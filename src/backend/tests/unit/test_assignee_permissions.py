"""
Unit tests for assignee permission logic in RequestService.

NEW PERMISSION MODEL (NF-3):
- Any technician can modify any request that is NOT solved (countAsSolved=false)
- The assignee concept is informational only, not a permission gate
- Cannot add/remove assignees on solved requests (countAsSolved=true)
- Cannot remove the last assignee (still enforced)
"""

import pytest
import pytest_asyncio
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from models.database_models import User, Role, UserRole, ServiceRequest, RequestStatus
from services.request_service import RequestService


@pytest_asyncio.fixture
async def technician_role(db_session: AsyncSession) -> Role:
    """Create Technician role."""
    role = Role(
        name="Technician",
        description="Technician role for testing",
        ar_name="فني",
    )
    db_session.add(role)
    await db_session.commit()
    await db_session.refresh(role)
    return role


@pytest_asyncio.fixture
async def technician_a(db_session: AsyncSession, technician_role: Role) -> User:
    """Create first technician (will be assigned to request)."""
    user = User(
        username="tech_a",
        email="tech_a@example.com",
        full_name="Technician A",
        is_active=True,
        is_technician=True,
        is_domain=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Assign technician role
    user_role = UserRole(
        user_id=user.id,
        role_id=technician_role.id,
        is_active=True,
        is_deleted=False,
    )
    db_session.add(user_role)
    await db_session.commit()

    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def technician_b(db_session: AsyncSession, technician_role: Role) -> User:
    """Create second technician (NOT assigned to request)."""
    user = User(
        username="tech_b",
        email="tech_b@example.com",
        full_name="Technician B",
        is_active=True,
        is_technician=True,
        is_domain=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Assign technician role
    user_role = UserRole(
        user_id=user.id,
        role_id=technician_role.id,
        is_active=True,
        is_deleted=False,
    )
    db_session.add(user_role)
    await db_session.commit()

    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def technician_c(db_session: AsyncSession, technician_role: Role) -> User:
    """Create third technician (for additional assignment tests)."""
    user = User(
        username="tech_c",
        email="tech_c@example.com",
        full_name="Technician C",
        is_active=True,
        is_technician=True,
        is_domain=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # Assign technician role
    user_role = UserRole(
        user_id=user.id,
        role_id=technician_role.id,
        is_active=True,
        is_deleted=False,
    )
    db_session.add(user_role)
    await db_session.commit()

    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def requester_user(db_session: AsyncSession) -> User:
    """Create a requester user."""
    user = User(
        username="requester",
        email="requester@example.com",
        full_name="Requester User",
        is_active=True,
        is_technician=False,
        is_domain=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def request_status_open(db_session: AsyncSession) -> RequestStatus:
    """Create Open status (not solved)."""
    status = RequestStatus(
        id=1,
        name="Open",
        description="Request is open",
        ar_name="مفتوح",
        color="#3B82F6",
        count_as_solved=False,  # NOT solved
    )
    db_session.add(status)
    await db_session.commit()
    await db_session.refresh(status)
    return status


@pytest_asyncio.fixture
async def request_status_solved(db_session: AsyncSession) -> RequestStatus:
    """Create Solved status."""
    status = RequestStatus(
        id=6,
        name="Resolved",
        description="Request is resolved",
        ar_name="تم الحل",
        color="#22C55E",
        count_as_solved=True,  # SOLVED
    )
    db_session.add(status)
    await db_session.commit()
    await db_session.refresh(status)
    return status


@pytest_asyncio.fixture
async def open_request_with_assignee(
    db_session: AsyncSession,
    requester_user: User,
    technician_a: User,
    request_status_open: RequestStatus,
) -> ServiceRequest:
    """Create an open service request with one assigned technician."""
    request = ServiceRequest(
        id=uuid4(),
        title="Open Test Request",
        description="Test description",
        priority_id=1,
        category_id=1,
        requester_id=requester_user.id,
        status_id=request_status_open.id,
    )
    db_session.add(request)
    await db_session.commit()
    await db_session.refresh(request)

    # Assign technician_a
    from models.database_models import RequestAssignee
    assignment = RequestAssignee(
        request_id=request.id,
        assignee_id=technician_a.id,
        assigned_by=requester_user.id,
    )
    db_session.add(assignment)
    await db_session.commit()

    return request


@pytest_asyncio.fixture
async def solved_request_with_assignee(
    db_session: AsyncSession,
    requester_user: User,
    technician_a: User,
    request_status_solved: RequestStatus,
) -> ServiceRequest:
    """Create a solved service request with one assigned technician."""
    request = ServiceRequest(
        id=uuid4(),
        title="Solved Test Request",
        description="Test description",
        priority_id=1,
        category_id=1,
        requester_id=requester_user.id,
        status_id=request_status_solved.id,
    )
    db_session.add(request)
    await db_session.commit()
    await db_session.refresh(request)

    # Assign technician_a
    from models.database_models import RequestAssignee
    assignment = RequestAssignee(
        request_id=request.id,
        assignee_id=technician_a.id,
        assigned_by=requester_user.id,
    )
    db_session.add(assignment)
    await db_session.commit()

    return request


# ============================================================================
# Tests: NF-3 - Any Technician Can Add Assignees (non-solved requests)
# ============================================================================


@pytest.mark.asyncio
async def test_assigned_technician_can_add_assignee(
    db_session: AsyncSession,
    open_request_with_assignee: ServiceRequest,
    technician_a: User,
    technician_c: User,
):
    """Test that an assigned technician can add more assignees."""
    result = await RequestService.assign_user_to_request(
        db=db_session,
        request_id=open_request_with_assignee.id,
        user_id=technician_c.id,
        assigned_by=technician_a.id,
        assigner_user=technician_a,
    )

    assert result is not None
    assert result.id == open_request_with_assignee.id


@pytest.mark.asyncio
async def test_unassigned_technician_can_add_assignee(
    db_session: AsyncSession,
    open_request_with_assignee: ServiceRequest,
    technician_b: User,  # NOT assigned to the request
    technician_c: User,
):
    """
    NF-3: Any technician can add assignees to non-solved requests.
    This test verifies that even unassigned technicians can add assignees.
    """
    result = await RequestService.assign_user_to_request(
        db=db_session,
        request_id=open_request_with_assignee.id,
        user_id=technician_c.id,
        assigned_by=technician_b.id,
        assigner_user=technician_b,
    )

    assert result is not None
    assert result.id == open_request_with_assignee.id


# ============================================================================
# Tests: NF-3 - Any Technician Can Remove Assignees (non-solved requests)
# ============================================================================


@pytest.mark.asyncio
async def test_assigned_technician_can_remove_assignee(
    db_session: AsyncSession,
    open_request_with_assignee: ServiceRequest,
    technician_a: User,
    technician_c: User,
):
    """
    NF-3: Any technician can remove assignees from non-solved requests.
    """
    # First add a second assignee so we're not removing the last one
    from models.database_models import RequestAssignee
    assignment = RequestAssignee(
        request_id=open_request_with_assignee.id,
        assignee_id=technician_c.id,
        assigned_by=technician_a.id,
    )
    db_session.add(assignment)
    await db_session.commit()

    # Now technician_a should be able to remove technician_c
    result = await RequestService.unassign_user_from_request(
        db=db_session,
        request_id=open_request_with_assignee.id,
        user_id=technician_c.id,
        unassigner_user=technician_a,
    )

    assert result is True


@pytest.mark.asyncio
async def test_unassigned_technician_can_remove_assignee(
    db_session: AsyncSession,
    open_request_with_assignee: ServiceRequest,
    technician_a: User,
    technician_b: User,  # NOT assigned to the request
    technician_c: User,
):
    """
    NF-3: Any technician can remove assignees from non-solved requests.
    Even unassigned technicians can remove assignees.
    """
    # First add a second assignee so we're not removing the last one
    from models.database_models import RequestAssignee
    assignment = RequestAssignee(
        request_id=open_request_with_assignee.id,
        assignee_id=technician_c.id,
        assigned_by=technician_a.id,
    )
    db_session.add(assignment)
    await db_session.commit()

    # Now technician_b (unassigned) should be able to remove technician_c
    result = await RequestService.unassign_user_from_request(
        db=db_session,
        request_id=open_request_with_assignee.id,
        user_id=technician_c.id,
        unassigner_user=technician_b,
    )

    assert result is True


# ============================================================================
# Tests: NF-3 - Cannot Modify Solved Requests
# ============================================================================


@pytest.mark.asyncio
async def test_cannot_add_assignee_to_solved_request(
    db_session: AsyncSession,
    solved_request_with_assignee: ServiceRequest,
    technician_a: User,
    technician_c: User,
):
    """
    NF-3: Cannot add assignees to solved requests (countAsSolved=true).
    """
    with pytest.raises(ValueError) as exc_info:
        await RequestService.assign_user_to_request(
            db=db_session,
            request_id=solved_request_with_assignee.id,
            user_id=technician_c.id,
            assigned_by=technician_a.id,
            assigner_user=technician_a,
        )

    assert "solved request" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_cannot_remove_assignee_from_solved_request(
    db_session: AsyncSession,
    solved_request_with_assignee: ServiceRequest,
    technician_a: User,
    technician_c: User,
):
    """
    NF-3: Cannot remove assignees from solved requests (countAsSolved=true).
    """
    # First add a second assignee
    from models.database_models import RequestAssignee
    assignment = RequestAssignee(
        request_id=solved_request_with_assignee.id,
        assignee_id=technician_c.id,
        assigned_by=technician_a.id,
    )
    db_session.add(assignment)
    await db_session.commit()

    # Now try to remove - should fail because request is solved
    with pytest.raises(ValueError) as exc_info:
        await RequestService.unassign_user_from_request(
            db=db_session,
            request_id=solved_request_with_assignee.id,
            user_id=technician_c.id,
            unassigner_user=technician_a,
        )

    assert "solved request" in str(exc_info.value).lower()


# ============================================================================
# Tests: Edge Cases
# ============================================================================


@pytest.mark.asyncio
async def test_cannot_remove_last_assignee(
    db_session: AsyncSession,
    open_request_with_assignee: ServiceRequest,
    technician_a: User,
):
    """
    Test that cannot remove the last assignee (even for open requests).
    This rule is still enforced in the new permission model.
    """
    # open_request_with_assignee has only one assignee (technician_a)
    # Should not be able to remove the last assignee

    with pytest.raises(ValueError) as exc_info:
        await RequestService.unassign_user_from_request(
            db=db_session,
            request_id=open_request_with_assignee.id,
            user_id=technician_a.id,
            unassigner_user=technician_a,
        )

    # The error message contains "must_have_assignee"
    assert "must_have_assignee" in str(exc_info.value)


@pytest.mark.asyncio
async def test_cannot_assign_already_assigned_user(
    db_session: AsyncSession,
    open_request_with_assignee: ServiceRequest,
    technician_a: User,
):
    """Test that cannot assign a user who is already assigned."""
    # technician_a is already assigned to the request
    # Trying to assign them again should raise ValueError

    with pytest.raises(ValueError) as exc_info:
        await RequestService.assign_user_to_request(
            db=db_session,
            request_id=open_request_with_assignee.id,
            user_id=technician_a.id,
            assigned_by=technician_a.id,
            assigner_user=technician_a,
        )

    assert "already assigned" in str(exc_info.value).lower()
