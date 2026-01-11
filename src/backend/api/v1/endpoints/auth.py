"""
Authentication endpoints for passwordless authentication.

This module provides FastAPI endpoints for login, logout,
and session management operations.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.dependencies import (
    blacklist_token,
    get_client_ip,
    get_current_user,
    get_non_blacklisted_user,
    get_optional_user,
    get_user_agent,
    require_admin,
)
from models import User
from schemas.auth import (
    ADLoginRequest,
    AdminLoginRequest,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    SessionInfo,
    SSOLoginRequest,
    TokenResponse,
    TokenValidationRequest,
    TokenValidationResponse,
)
from services.auth_service import auth_service

# Create router with prefix
router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def passwordless_login(
    login_data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> LoginResponse:
    """Passwordless authentication login endpoint.

    Authenticates a user without requiring a password.
    Returns tokens and user info on successful authentication.

    Args:
        login_data: Login request data
        request: FastAPI request object
        db: Database session

    Returns:
        LoginResponse with tokens and session info

    Raises:
        HTTPException: If login fails
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
    current_user: User = Depends(get_non_blacklisted_user),
    db: AsyncSession = Depends(get_session),
) -> LogoutResponse:
    """Logout endpoint.

    Invalidates the current JWT token by adding it to the blacklist.
    Blacklisted tokens are rejected by get_non_blacklisted_user dependency.

    Args:
        request: FastAPI request object
        current_user: Currently authenticated user (with non-blacklisted token check)
        db: Database session

    Returns:
        LogoutResponse with success status

    Raises:
        HTTPException: If logout fails
    """
    try:
        # Extract token JTI from Authorization header and blacklist it
        from core.security import decode_token

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                payload = decode_token(token)
                jti = payload.get("jti")
                if jti:
                    # Add token to blacklist (stored in Redis with TTL)
                    await blacklist_token(jti)
            except Exception:
                pass  # Token already expired or invalid, no need to blacklist

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

    Args:
        request: Token validation request
        db: Database session

    Returns:
        TokenValidationResponse with validation result

    Raises:
        HTTPException: If validation fails
    """
    try:
        result = await auth_service.validate_access_token(
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

    Authenticates a user via Single Sign-On.
    Returns tokens and user info on successful authentication.

    Args:
        sso_data: SSO login request data
        request: FastAPI request object
        db: Database session

    Returns:
        LoginResponse with tokens and session info

    Raises:
        HTTPException: If SSO login fails
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

    Authenticates a user via Active Directory credentials (username + password).
    Returns tokens and user info on successful authentication.

    Args:
        ad_data: AD login request data
        request: FastAPI request object
        db: Database session

    Returns:
        LoginResponse with tokens and session info

    Raises:
        HTTPException: If AD login fails
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

    This endpoint allows admin users to authenticate using credentials
    stored in the local database (independent of AD/SSO systems).

    Admin users do NOT require technician role - admin status grants full access.

    Args:
        admin_data: Admin login request with username and password
        request: FastAPI request object
        db: Database session

    Returns:
        LoginResponse with tokens and admin user data

    Raises:
        HTTPException: If admin login fails
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

    Args:
        current_user: Optional current user for authentication status

    Returns:
        Dictionary with health status and user info if authenticated
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
    current_user: User = Depends(get_non_blacklisted_user),
    db: AsyncSession = Depends(get_session),
) -> List[SessionInfo]:
    """Get all active sessions for current user.

    Args:
        current_user: Currently authenticated user
        db: Database session

    Returns:
        List of active session information

    Raises:
        HTTPException: If session retrieval fails
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
    current_user: User = Depends(get_non_blacklisted_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Terminate a specific user session.

    Args:
        session_id: ID of session to terminate
        current_user: Currently authenticated user
        db: Database session

    Returns:
        Dictionary with termination status

    Raises:
        HTTPException: If session termination fails
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
    current_user: User = Depends(get_non_blacklisted_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Terminate all sessions for current user.

    Args:
        current_user: Currently authenticated user
        db: Database session

    Returns:
        Dictionary with termination status

    Raises:
        HTTPException: If session termination fails
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
    current_user: User = Depends(get_non_blacklisted_user),
) -> dict:
    """Get current user information endpoint.

    Args:
        current_user: Currently authenticated user

    Returns:
        Dictionary with user information
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
