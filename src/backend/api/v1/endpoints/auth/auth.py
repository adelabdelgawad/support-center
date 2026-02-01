"""
Authentication endpoints for passwordless authentication.

This module provides FastAPI endpoints for:
- Passwordless authentication (username-only login)
- Active Directory authentication (username + password)
- SSO authentication
- Admin local database authentication
- Session management (view, terminate)
- Token validation

All login endpoints return JWT access tokens (30-day expiry) and user information.
Sessions are tracked in the database for security auditing.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_session
from core.dependencies import (
    get_client_ip,
    get_current_user,
    get_optional_user,
)
from db import User
from api.schemas.login import (
    ADLoginRequest,
    AdminLoginRequest,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    SessionInfo,
    SSOLoginRequest,
    TokenValidationRequest,
    TokenValidationResponse,
)
from api.services.auth_service import auth_service

# Create router with prefix
router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def passwordless_login(
    login_data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> LoginResponse:
    """Passwordless authentication login endpoint.

    Authenticates a user using only their username (no password required).
    Creates a session with IP and user agent tracking.
    Returns a long-lived JWT access token (30-day expiry).

    Args:
        login_data: Login request containing username
        request: FastAPI request object for extracting client IP
        db: Database session

    Returns:
        LoginResponse with:
        - access_token: JWT token for API authentication
        - token_type: Always "Bearer"
        - user: User information (id, username, full_name, email, etc.)
        - session_id: Database session ID for tracking

    Raises:
        HTTPException 401: If username is not found or user is blocked

    Notes:
        - Access tokens are valid for 30 days
        - Client IP is captured for security auditing
        - User agent is captured for session tracking
        - Blocked users cannot authenticate
    """
    try:
        # Get client information
        client_ip = get_client_ip(request)

        # Perform passwordless authentication
        result = await auth_service.passwordless_login(
            login_data=login_data,
            db=db,
            client_ip=client_ip,
        )

        # Return the LoginResponse directly
        return result
    except HTTPException:
        # Re-raise HTTPExceptions (including our authorization check above)
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> LogoutResponse:
    """Logout endpoint.

    Marks the current session as terminated in the database.
    Clients should discard their JWT tokens to complete logout.

    Args:
        request: FastAPI request object
        current_user: Currently authenticated user
        db: Database session

    Returns:
        LogoutResponse with success status and logout timestamp

    Raises:
        HTTPException 500: If logout fails

    Notes:
        - Tokens will expire naturally based on their 30-day expiry
        - Session is immediately marked as terminated in database
        - Client is responsible for discarding the token
    """
    try:
        return LogoutResponse(
            success=True,
            message="Successfully logged out",
            logged_out_at=datetime.now(timezone.utc),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Logout failed: {str(e)}",
        )


# /refresh endpoint removed - sessions are now permanent with long-lived access tokens (30 days)


@router.post("/validate", response_model=TokenValidationResponse)
async def validate_token(
    request: TokenValidationRequest,
    db: AsyncSession = Depends(get_session),
) -> TokenValidationResponse:
    """Token validation endpoint.

    Validates a JWT access token and returns user information if valid.

    Args:
        request: Token validation request containing the token
        db: Database session

    Returns:
        TokenValidationResponse with:
        - valid: Boolean indicating if token is valid
        - user_id: User ID if valid
        - username: Username if valid
        - session_id: Session ID if valid
        - expires_at: Token expiry timestamp if valid
        - message: Error message if invalid

    Raises:
        HTTPException 500: If validation check fails

    Notes:
        - Checks token signature and expiry
        - Verifies session exists in database
        - Returns user information for valid tokens
    """
    try:
        result = await auth_service.validate_token(
            token=request.token,
            db=db,
        )

        return TokenValidationResponse(
            valid=result["valid"],
            user_id=result.get("user_id"),
            username=result.get("username"),
            session_id=result.get("session_id"),
            expires_at=result.get("expires_at"),
            message=result.get("message"),
        )
    except Exception as e:
        return TokenValidationResponse(
            valid=False,
            message=f"Token validation failed: {str(e)}",
        )


# Token revocation endpoint removed - use /logout instead for session termination
# Long-lived tokens (30 days) are managed through logout, not individual revocation


@router.post("/sso-login", response_model=LoginResponse)
async def sso_login(
    sso_data: SSOLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> LoginResponse:
    """SSO-based authentication login endpoint.

    Authenticates a user via Single Sign-On (SSO).
    Creates or updates user record based on SSO identity.
    Returns JWT access token and user information.

    Args:
        sso_data: SSO login request with username and SSO provider info
        request: FastAPI request object for extracting client IP
        db: Database session

    Returns:
        LoginResponse with access token and user information

    Raises:
        HTTPException 401: If SSO authentication fails

    Notes:
        - Creates new user if SSO username doesn't exist
        - Updates existing user if found
        - Client IP is captured for security auditing
    """
    try:
        # Get client information
        client_ip = get_client_ip(request)

        # Perform SSO authentication
        result = await auth_service.sso_login(
            login_data=sso_data,
            db=db,
            client_ip=client_ip,
        )

        # Return the LoginResponse directly
        return result
    except HTTPException:
        # Re-raise HTTPExceptions (including our authorization check above)
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"SSO authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/ad-login", response_model=LoginResponse)
async def ad_login(
    ad_data: ADLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> LoginResponse:
    """Active Directory-based authentication login endpoint.

    Authenticates a user via Active Directory using username and password.
    Verifies credentials against LDAP server.
    Creates or updates domain user record.

    Args:
        ad_data: AD login request with username and password
        request: FastAPI request object for extracting client IP
        db: Database session

    Returns:
        LoginResponse with access token and user information

    Raises:
        HTTPException 401: If AD authentication fails or credentials are invalid
        HTTPException 503: If AD server is unreachable

    Notes:
        - Requires valid AD configuration in system settings
        - Creates domain user record on successful authentication
        - Client IP is captured for security auditing
        - Password is verified against LDAP server
    """
    try:
        # Get client information
        client_ip = get_client_ip(request)

        # Perform AD authentication
        result = await auth_service.ad_login(
            login_data=ad_data, db=db, client_ip=client_ip
        )

        # auth_service.ad_login returns a LoginResponse object directly
        return result
    except HTTPException:
        # Re-raise HTTPExceptions (including our authorization check above)
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"AD authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/admin-login", response_model=LoginResponse)
async def admin_login(
    admin_data: AdminLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> LoginResponse:
    """Local database admin login endpoint.

    Authenticates admin users using credentials stored in the local database.
    Independent of AD/SSO systems - for emergency admin access.

    Args:
        admin_data: Admin login request with username and password
        request: FastAPI request object for extracting client IP
        db: Database session

    Returns:
        LoginResponse with access token and admin user data

    Raises:
        HTTPException 401: If credentials are invalid or user not found

    Notes:
        - Only for users with admin role
        - Does NOT require technician role
        - Password is verified against local database hash
        - Use this for emergency access when AD is unavailable
    """
    try:
        # Get client information
        client_ip = get_client_ip(request)

        # Perform admin authentication using local database
        result = await auth_service.admin_login(
            login_data=admin_data,
            db=db,
            client_ip=client_ip,
        )

        # Admin users don't require technician role - admin status is sufficient
        # Return the LoginResponse directly
        return result
    except HTTPException:
        # Re-raise HTTPExceptions from auth service
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Admin authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("/health")
async def health_check(
    current_user: User = Depends(get_optional_user),
) -> dict:
    """Health check endpoint for authentication service.

    Returns service health status and optional user authentication status.

    Args:
        current_user: Optional current user for authentication status

    Returns:
        Dictionary with:
        - status: Always "healthy"
        - timestamp: Current UTC timestamp
        - service: Always "authentication"
        - authenticated: Boolean indicating if user is logged in
        - user: User info (id, username) if authenticated

    Notes:
        - Does not require authentication
        - Use to verify auth service is running
        - Returns user info if token is provided
    """
    response = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "authentication",
    }

    if current_user:
        response["authenticated"] = True
        response["user"] = {
            "id": current_user.id,
            "username": current_user.username,
        }
    else:
        response["authenticated"] = False

    return response


@router.get("/sessions")
async def get_user_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> List[SessionInfo]:
    """Get all active sessions for current user.

    Returns list of all sessions associated with the authenticated user,
    including current session and sessions from other devices.

    Args:
        current_user: Currently authenticated user
        db: Database session

    Returns:
        List of SessionInfo objects with:
        - session_id: Session ID
        - device_fingerprint: Device identifier
        - authenticated_at: When session was created
        - last_refresh: Last activity timestamp
        - expires_at: Session expiry timestamp

    Raises:
        HTTPException 500: If session retrieval fails

    Notes:
        - Requires authentication
        - Shows all sessions across all devices
        - Useful for managing active logins
    """
    try:
        sessions = await auth_service.get_user_sessions(
            user_id=current_user.id,
            db=db,
        )

        return [
            SessionInfo(
                session_id=session.id,
                device_fingerprint=session.device_fingerprint,
                authenticated_at=session.authenticated_at,
                last_refresh=session.last_auth_refresh,
                expires_at=session.expires_at,
            )
            for session in sessions
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve sessions: {str(e)}",
        )


@router.delete("/sessions/{session_id}")
async def terminate_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Terminate a specific user session.

    Logs out a specific session by ID. Use this to log out from
    a specific device while keeping other sessions active.

    Args:
        session_id: ID of session to terminate
        current_user: Currently authenticated user
        db: Database session

    Returns:
        Dictionary with success status and message

    Raises:
        HTTPException 403: If session belongs to different user
        HTTPException 404: If session not found
        HTTPException 500: If session termination fails

    Notes:
        - Only terminate your own sessions
        - Invalidates the session immediately
        - Client using that session will need to re-authenticate
    """
    try:
        await auth_service.terminate_session(
            user_id=current_user.id,
            session_id=session_id,
            db=db,
        )

        return {"success": True, "message": "Session terminated successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to terminate session: {str(e)}",
        )


@router.delete("/sessions")
async def terminate_all_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Terminate all sessions for current user.

    Logs out from all devices including current session.
    Use this for security purposes (e.g., account compromise).

    Args:
        current_user: Currently authenticated user
        db: Database session

    Returns:
        Dictionary with success status and message

    Raises:
        HTTPException 500: If session termination fails

    Notes:
        - Logs out from ALL devices
        - Current session is also terminated
        - User will need to re-authenticate on all devices
    """
    try:
        await auth_service.terminate_all_sessions(
            user_id=current_user.id,
            exclude_current=True,
            db=db,
        )

        return {
            "success": True,
            "message": "All sessions terminated successfully",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to terminate sessions: {str(e)}",
        )


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get current user information endpoint.

    Returns complete user profile for the authenticated user.

    Args:
        current_user: Currently authenticated user

    Returns:
        Dictionary with user information:
        - id: User ID
        - username: Username
        - email: Email address
        - full_name: Full name
        - title: Job title
        - is_active: Account active status
        - is_online: Online status
        - created_at: Account creation timestamp
        - updated_at: Last update timestamp
        - last_seen: Last activity timestamp

    Notes:
        - Requires authentication
        - Returns user's own profile only
        - Useful for profile display and account management
    """
    return {
        "id": str(current_user.id),
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "title": current_user.title,
        "is_active": current_user.is_active,
        "is_online": current_user.is_online,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "updated_at": (
            current_user.updated_at.isoformat()
            if current_user.updated_at
            else None
        ),
        "last_seen": (
            current_user.last_seen.isoformat()
            if current_user.last_seen
            else None
        ),
    }
