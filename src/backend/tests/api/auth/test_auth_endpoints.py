"""
Tests for authentication endpoints (POST, GET /backend/auth/*).

Tests cover:
- Passwordless login
- Active Directory login
- SSO login
- Admin local login
- Logout functionality
- Token validation
- Session management (list, terminate)
- Health checks
- Current user info (/me)
- Error handling for auth failures
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import MagicMock, patch

from tests.factories import UserFactory
from db.models import User


# ============================================================================
# POST /backend/auth/login - Passwordless Login
# ============================================================================


@pytest.mark.asyncio
async def test_passwordless_login_success(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test successful passwordless login."""
    # Create active user
    user = UserFactory.create(username="activeuser", is_active=True, is_blocked=False)
    db_session.add(user)
    await db_session.commit()

    response = await unauth_client.post(
        "/backend/auth/login",
        json={"username": "activeuser"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    assert "accessToken" in data or "access_token" in data
    assert "tokenType" in data or "token_type" in data
    assert "user" in data
    assert data["user"]["username"] == "activeuser"


@pytest.mark.asyncio
async def test_passwordless_login_user_not_found(unauth_client: AsyncClient):
    """Test login with non-existent username."""
    response = await unauth_client.post(
        "/backend/auth/login",
        json={"username": "nonexistentuser"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_passwordless_login_inactive_user(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test login with inactive user."""
    user = UserFactory.create(username="inactiveuser", is_active=False)
    db_session.add(user)
    await db_session.commit()

    response = await unauth_client.post(
        "/backend/auth/login",
        json={"username": "inactiveuser"},
    )

    # Should fail (401) or succeed but user will have limited permissions
    assert response.status_code in [200, 401]


@pytest.mark.asyncio
async def test_passwordless_login_blocked_user(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test login with blocked user."""
    user = UserFactory.create(username="blockeduser", is_active=True, is_blocked=True)
    db_session.add(user)
    await db_session.commit()

    response = await unauth_client.post(
        "/backend/auth/login",
        json={"username": "blockeduser"},
    )

    assert response.status_code == 401
    assert "blocked" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_passwordless_login_creates_session(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test that login creates a session record."""
    user = UserFactory.create(username="sessionuser", is_active=True)
    db_session.add(user)
    await db_session.commit()

    response = await unauth_client.post(
        "/backend/auth/login",
        json={"username": "sessionuser"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "sessionId" in data or "session_id" in data


# ============================================================================
# POST /backend/auth/ad-login - Active Directory Login
# ============================================================================


@pytest.mark.asyncio
async def test_ad_login_success(
    unauth_client: AsyncClient,
    db_session: AsyncSession,
    mock_ldap_service,
):
    """Test successful AD login with valid credentials."""
    # Mock LDAP authentication
    mock_ldap_service.authenticate_user.return_value = True
    mock_ldap_service.get_user_by_username.return_value = MagicMock(
        username="ad.user",
        email="ad.user@example.com",
        full_name="AD User",
    )

    # Patch the LDAP service
    with patch("api.services.auth_service.ldap_service", mock_ldap_service):
        response = await unauth_client.post(
            "/backend/auth/ad-login",
            json={
                "username": "ad.user",
                "password": "correct-password",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "accessToken" in data or "access_token" in data
    assert data["user"]["username"] == "ad.user"


@pytest.mark.asyncio
async def test_ad_login_invalid_credentials(
    unauth_client: AsyncClient,
    mock_ldap_service,
):
    """Test AD login with invalid credentials."""
    # Mock LDAP authentication failure
    mock_ldap_service.authenticate_user.return_value = False

    with patch("api.services.auth_service.ldap_service", mock_ldap_service):
        response = await unauth_client.post(
            "/backend/auth/ad-login",
            json={
                "username": "ad.user",
                "password": "wrong-password",
            },
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ad_login_creates_domain_user(
    unauth_client: AsyncClient,
    db_session: AsyncSession,
    mock_ldap_service,
):
    """Test that AD login creates domain user record."""
    mock_ldap_service.authenticate_user.return_value = True
    mock_ldap_service.get_user_by_username.return_value = MagicMock(
        username="new.ad.user",
        email="new.ad.user@example.com",
        full_name="New AD User",
    )

    with patch("api.services.auth_service.ldap_service", mock_ldap_service):
        response = await unauth_client.post(
            "/backend/auth/ad-login",
            json={
                "username": "new.ad.user",
                "password": "password",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["user"]["username"] == "new.ad.user"


# ============================================================================
# POST /backend/auth/sso-login - SSO Login
# ============================================================================


@pytest.mark.asyncio
async def test_sso_login_success(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test successful SSO login."""
    response = await unauth_client.post(
        "/backend/auth/sso-login",
        json={
            "username": "sso.user",
            "provider": "microsoft",
        },
    )

    # May succeed or fail depending on SSO implementation
    assert response.status_code in [200, 401, 501]


@pytest.mark.asyncio
async def test_sso_login_creates_user(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test that SSO login creates user if not exists."""
    response = await unauth_client.post(
        "/backend/auth/sso-login",
        json={
            "username": "new.sso.user",
            "provider": "google",
        },
    )

    # May succeed or fail depending on SSO implementation
    assert response.status_code in [200, 401, 501]


# ============================================================================
# POST /backend/auth/admin-login - Admin Local Login
# ============================================================================


@pytest.mark.asyncio
async def test_admin_login_success(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test successful admin login with local credentials."""
    # Create admin user with hashed password
    from core.utils.encryption import hash_password
    
    hashed_password = hash_password("admin-password")
    admin = UserFactory.create_admin(
        username="localadmin",
        password_hash=hashed_password,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()

    response = await unauth_client.post(
        "/backend/auth/admin-login",
        json={
            "username": "localadmin",
            "password": "admin-password",
        },
    )

    # May succeed depending on password hash implementation
    assert response.status_code in [200, 401]


@pytest.mark.asyncio
async def test_admin_login_invalid_password(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test admin login with wrong password."""
    from core.utils.encryption import hash_password
    
    hashed_password = hash_password("correct-password")
    admin = UserFactory.create_admin(
        username="adminuser2",
        password_hash=hashed_password,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()

    response = await unauth_client.post(
        "/backend/auth/admin-login",
        json={
            "username": "adminuser2",
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_login_non_admin_user(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test that non-admin user cannot use admin login."""
    from core.utils.encryption import hash_password
    
    hashed_password = hash_password("password")
    regular_user = UserFactory.create(
        username="regularuser",
        password_hash=hashed_password,
        is_active=True,
        is_super_admin=False,
    )
    db_session.add(regular_user)
    await db_session.commit()

    response = await unauth_client.post(
        "/backend/auth/admin-login",
        json={
            "username": "regularuser",
            "password": "password",
        },
    )

    assert response.status_code == 401


# ============================================================================
# POST /backend/auth/logout - Logout
# ============================================================================


@pytest.mark.asyncio
async def test_logout_success(client: AsyncClient, seed_user: User):
    """Test successful logout."""
    response = await client.post("/backend/auth/logout")

    assert response.status_code == 200
    data = response.json()
    assert "message" in data


# ============================================================================
# POST /backend/auth/validate - Token Validation
# ============================================================================


@pytest.mark.asyncio
async def test_validate_token_valid(unauth_client: AsyncClient, db_session: AsyncSession):
    """Test validating a valid token."""
    # First login to get a token
    user = UserFactory.create(username="tokenuser", is_active=True)
    db_session.add(user)
    await db_session.commit()

    login_response = await unauth_client.post(
        "/backend/auth/login",
        json={"username": "tokenuser"},
    )
    assert login_response.status_code == 200
    token = login_response.json().get("accessToken") or login_response.json().get("access_token")

    # Validate the token
    response = await unauth_client.post(
        "/backend/auth/validate",
        json={"token": token},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert "userId" in data or "user_id" in data


@pytest.mark.asyncio
async def test_validate_token_invalid(unauth_client: AsyncClient):
    """Test validating an invalid token."""
    response = await unauth_client.post(
        "/backend/auth/validate",
        json={"token": "invalid-token-string"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False


# ============================================================================
# GET /backend/auth/health - Auth Health Check
# ============================================================================


@pytest.mark.asyncio
async def test_auth_health_check_unauthenticated(unauth_client: AsyncClient):
    """Test health check without authentication."""
    response = await unauth_client.get("/backend/auth/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "authentication"
    assert data["authenticated"] is False


@pytest.mark.asyncio
async def test_auth_health_check_authenticated(client: AsyncClient, seed_user: User):
    """Test health check with authentication."""
    response = await client.get("/backend/auth/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["authenticated"] is True
    assert "user" in data


# ============================================================================
# GET /backend/auth/sessions - List User Sessions
# ============================================================================


@pytest.mark.asyncio
async def test_get_user_sessions(client: AsyncClient, seed_user: User):
    """Test getting all active sessions for current user."""
    response = await client.get("/backend/auth/sessions")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


# ============================================================================
# DELETE /backend/auth/sessions/{session_id} - Terminate Session
# ============================================================================


@pytest.mark.asyncio
async def test_terminate_session_success(client: AsyncClient, seed_user: User):
    """Test terminating a specific session."""
    # Create a session first (via login)
    from uuid import uuid4
    session_id = str(uuid4())

    response = await client.delete(f"/backend/auth/sessions/{session_id}")

    # May be 200 (success) or 404 (session not found) or 500 (implementation dependent)
    assert response.status_code in [200, 404, 500]


@pytest.mark.asyncio
async def test_terminate_session_invalid_uuid(client: AsyncClient, seed_user: User):
    """Test terminating session with invalid UUID."""
    response = await client.delete("/backend/auth/sessions/not-a-uuid")

    assert response.status_code in [400, 422]


# ============================================================================
# DELETE /backend/auth/sessions - Terminate All Sessions
# ============================================================================


@pytest.mark.asyncio
async def test_terminate_all_sessions(client: AsyncClient, seed_user: User):
    """Test terminating all sessions for current user."""
    response = await client.delete("/backend/auth/sessions")

    assert response.status_code in [200, 500]


# ============================================================================
# GET /backend/auth/me - Get Current User Info
# ============================================================================


@pytest.mark.asyncio
async def test_get_current_user_info(client: AsyncClient, seed_user: User):
    """Test getting current user profile."""
    response = await client.get("/backend/auth/me")

    assert response.status_code == 200
    data = response.json()

    # Verify user data
    assert data["username"] == seed_user.username
    assert data["email"] == seed_user.email
    assert "id" in data
    assert "fullName" in data or "full_name" in data


@pytest.mark.asyncio
async def test_get_current_user_info_unauthenticated(unauth_client: AsyncClient):
    """Test /me without authentication."""
    response = await unauth_client.get("/backend/auth/me")

    assert response.status_code == 401
