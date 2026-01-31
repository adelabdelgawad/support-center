"""
Authentication and authorization dependencies for FastAPI.

This module provides FastAPI dependency functions for authentication,
authorization, and security validation.
"""

import secrets
from datetime import datetime
from typing import List, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.config import settings
from core.database import get_session
from core.security import (
    SecurityError,
    TokenExpiredError,
    TokenInvalidError,
    decode_token,
    get_user_id_from_token,
)
from models import User, ServiceRequest, UserRole, BusinessUnitUserAssign, TechnicianRegion

# HTTP Bearer security scheme
security = HTTPBearer()


class AuthenticationError(HTTPException):
    """Custom authentication error."""

    def __init__(self, detail: str = "Authentication required"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class AuthorizationError(HTTPException):
    """Custom authorization error."""

    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_session),
) -> User:
    """Get the current authenticated user from JWT token.

    SECURITY: JWT token validation provides sufficient authentication.
    Token expiry and signature validation ensure security.

    Args:
        credentials: HTTP Bearer credentials containing the JWT token
        db: Database session

    Returns:
        User object for the authenticated user

    Raises:
        AuthenticationError: If token is invalid or user not found
    """
    token = credentials.credentials

    try:
        # Decode and validate token (checks expiry, signature, etc.)
        payload = decode_token(token)

        # Extract user ID from token
        user_id = get_user_id_from_token(payload)  # Returns UUID string

        # Get user from database using UUID (User.id is now UUID primary key)
        # Eager-load relationships used by _get_region_filter for performance
        result = await db.execute(
            select(User)
            .where(User.id == user_id)
            .options(
                selectinload(User.user_roles).selectinload(UserRole.role),
                selectinload(User.business_unit_assigns),
                selectinload(User.region_assigns),
            )
        )
        user = result.scalar_one_or_none()

        if not user:
            raise AuthenticationError("User not found")

        if not user.is_active:
            raise AuthenticationError("User account is inactive")

        return user

    except (TokenExpiredError, TokenInvalidError, SecurityError) as e:
        raise AuthenticationError(str(e))
    except AuthenticationError:
        raise  # Re-raise our custom errors as-is
    except Exception as e:
        raise AuthenticationError(f"Authentication failed: {str(e)}")


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current user and verify account is active.

    Args:
        current_user: Current authenticated user

    Returns:
        User object if account is active

    Raises:
        AuthenticationError: If user account is not active
    """
    if not current_user.is_active:
        raise AuthenticationError("Inactive user account")

    return current_user


# get_current_user_session REMOVED - no longer using session tracking
# JWT token validation is sufficient for authentication


async def get_optional_user(
    request: Request, db: AsyncSession = Depends(get_session)
) -> Optional[User]:
    """Get current user if token is provided, otherwise return None.

    SECURITY: Validates session exists and is active if token is provided.

    Args:
        request: FastAPI request object
        db: Database session

    Returns:
        User object if authenticated with valid session, None otherwise
    """
    try:
        # Try to extract token from request
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ", 1)[1]

        # Decode and validate token
        payload = decode_token(token)
        user_id = get_user_id_from_token(payload)  # Returns UUID string

        # Get user from database using UUID (User.id is now UUID primary key)
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            return None

        return user

    except Exception:
        # Return None for any authentication errors
        return None


def _is_valid_private_ip(ip_str: str) -> bool:
    """Validate that an IP address is a valid RFC 1918 private IP.

    Accepts:
    - 10.0.0.0/8 (10.x.x.x)
    - 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    - 192.168.0.0/16 (192.168.x.x)

    Args:
        ip_str: IP address string to validate

    Returns:
        True if valid private IP, False otherwise
    """
    import ipaddress
    try:
        ip = ipaddress.ip_address(ip_str.strip())
        return ip.is_private and not ip.is_loopback
    except (ValueError, AttributeError):
        return False


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request.

    Checks headers in this order of priority:
    1. X-Client-Private-IP: Set by desktop apps (Tauri) that know their local IP
       - SECURITY: Only accepts valid RFC 1918 private IPs to prevent spoofing
    2. X-Forwarded-For: Standard proxy/load balancer header
    3. X-Real-IP: Alternative proxy header
    4. Direct connection IP: Fallback

    Args:
        request: FastAPI request object

    Returns:
        Client IP address string
    """
    # Check for private IP from desktop app (Tauri requester-app)
    # Desktop apps behind corporate firewalls send their actual local IP in this header
    # SECURITY: Validate it's actually a private IP to prevent spoofing attacks
    client_private_ip = request.headers.get("X-Client-Private-IP")
    if client_private_ip and _is_valid_private_ip(client_private_ip):
        return client_private_ip.strip()

    # Check for forwarded headers (for proxy/load balancer scenarios)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"


def get_user_agent(request: Request) -> str:
    """Extract user agent from request.

    Args:
        request: FastAPI request object

    Returns:
        User agent string
    """
    return request.headers.get("User-Agent", "unknown")


# verify_session_active REMOVED - no longer using session tracking
# JWT token validation is sufficient for authentication


class RateLimitExceededError(HTTPException):
    """Custom rate limit error."""

    def __init__(self, detail: str = "Rate limit exceeded"):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": "60"},
        )


# Utility functions for token validation
def validate_token_format(token: str) -> bool:
    """Validate basic token format.

    Args:
        token: Token string to validate

    Returns:
        True if token format is valid
    """
    if not token or not isinstance(token, str):
        return False

    # JWT tokens should have 3 parts separated by dots
    parts = token.split(".")
    return len(parts) == 3


def extract_token_from_header(authorization: str) -> Optional[str]:
    """Extract token from Authorization header.

    Args:
        authorization: Authorization header value

    Returns:
        Token string if valid, None otherwise
    """
    if not authorization:
        return None

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    return parts[1]


# ============================================================================
# ROLE-BASED ACCESS CONTROL DEPENDENCIES
# ============================================================================


async def _get_user_with_roles(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_session),
) -> User:
    """Internal helper to get user with roles loaded.

    This is the core authentication function that:
    1. Validates the JWT token
    2. Ensures the session is active
    3. Loads the user with their roles

    Args:
        credentials: HTTP Bearer credentials containing JWT token
        db: Database session

    Returns:
        User object with roles loaded

    Raises:
        AuthenticationError: If token invalid or session inactive
    """
    token = credentials.credentials

    try:
        # Decode and validate token
        payload = decode_token(token)

        # Extract user ID from token
        user_id = get_user_id_from_token(payload)  # Returns UUID string

        # Get user from database with roles eagerly loaded using UUID (User.id is now UUID primary key)
        from models import UserRole
        result = await db.execute(
            select(User)
            .where(User.id == user_id)
            .options(
                # Eagerly load user_roles and their related role objects
                selectinload(User.user_roles).selectinload(UserRole.role)
            )
        )
        user = result.scalar_one_or_none()

        if not user:
            raise AuthenticationError("User not found")

        if not user.is_active:
            raise AuthenticationError("User account is inactive")

        return user

    except (TokenExpiredError, TokenInvalidError, SecurityError) as e:
        raise AuthenticationError(str(e))
    except AuthenticationError:
        raise
    except Exception as e:
        raise AuthenticationError(f"Authentication failed: {str(e)}")


def _has_role(user: User, role_name: str) -> bool:
    """Check if user has a specific role.

    Args:
        user: User object with user_roles loaded
        role_name: Role name to check (case-insensitive)

    Returns:
        True if user has the role, False otherwise
    """
    if not hasattr(user, 'user_roles') or not user.user_roles:
        return False

    role_name_lower = role_name.lower()

    for user_role in user.user_roles:
        if user_role.role and user_role.role.name and user_role.role.name.lower() == role_name_lower:
            # Check if the role assignment is active
            if not user_role.is_deleted and user_role.role.is_active:
                return True

    return False


async def require_technician(
    user: User = Depends(get_current_user),
) -> User:
    """Require user to have is_technician attribute set to True or be super admin.

    Validates token and checks if user has is_technician=True or is super admin.
    Super admins bypass this check and are always granted access.

    Args:
        user: Authenticated user

    Returns:
        User object if is_technician=True or is super admin

    Raises:
        AuthorizationError: If user is not a technician and is not super admin
    """
    # Super admins always have access (bypass attribute requirements)
    if user.is_super_admin:
        return user

    # Otherwise check for is_technician attribute
    if not user.is_technician:
        raise AuthorizationError("Technician access required")
    return user


async def require_senior(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require user to have 'Senior' role.

    Validates token and checks if user has Senior role.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if has Senior role

    Raises:
        AuthorizationError: If user does not have Senior role
    """
    if not _has_role(user, "Senior"):
        raise AuthorizationError("Senior role required")
    return user


async def require_supervisor(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require user to have 'Supervisor' role.

    Validates token and checks if user has Supervisor role.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if has Supervisor role

    Raises:
        AuthorizationError: If user does not have Supervisor role
    """
    if not _has_role(user, "Supervisor"):
        raise AuthorizationError("Supervisor role required")
    return user


async def require_manager(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require user to have 'Manager' role.

    Validates token and checks if user has Manager role.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if has Manager role

    Raises:
        AuthorizationError: If user does not have Manager role
    """
    if not _has_role(user, "Manager"):
        raise AuthorizationError("Manager role required")
    return user


async def require_auditor(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require user to have 'Auditor' role.

    Validates token and checks if user has Auditor role.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if has Auditor role

    Raises:
        AuthorizationError: If user does not have Auditor role
    """
    if not _has_role(user, "Auditor"):
        raise AuthorizationError("Auditor role required")
    return user


async def require_technician_or_auditor(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require user to be a technician OR have 'Auditor' role.

    Validates token and checks if user has is_technician=True OR has Auditor role.
    Super admins bypass this check and are always granted access.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if is technician or has Auditor role

    Raises:
        AuthorizationError: If user is not technician and does not have Auditor role
    """
    # Super admins always have access
    if user.is_super_admin:
        return user

    # Check if user is a technician
    if user.is_technician:
        return user

    # Check if user has Auditor role
    if _has_role(user, "Auditor"):
        return user

    raise AuthorizationError("Technician or Auditor role required")


async def require_admin(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require user to have 'Admin' role or is_super_admin flag.

    Validates token and checks if user has Admin role or is a super admin.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if has Admin role or is_super_admin

    Raises:
        AuthorizationError: If user does not have Admin role and is not super admin
    """
    # Super admins bypass role checks
    if user.is_super_admin:
        return user

    if not _has_role(user, "Admin"):
        raise AuthorizationError("Admin role required")
    return user


async def require_super_admin(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require user to have 'SuperAdmin' role or is_super_admin flag.

    Validates token and checks if user has SuperAdmin role or is_super_admin=True.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if has SuperAdmin role or flag

    Raises:
        AuthorizationError: If user does not have SuperAdmin role
    """
    # Check is_super_admin flag first (database field)
    if user.is_super_admin:
        return user

    # Then check for SuperAdmin role
    if not _has_role(user, "SuperAdmin"):
        raise AuthorizationError("SuperAdmin role required")

    return user


# ============================================================================
# DEPRECATED DEPENDENCIES (for backward compatibility)
# ============================================================================


def require_roles(*roles: str):
    """Create a dependency that requires any of the specified roles.

    DEPRECATED: Use specific role dependencies instead (require_technician, require_admin, etc.)
    This is kept for backward compatibility only.

    Args:
        *roles: Required role names

    Returns:
        Dependency function for role authorization
    """

    async def role_checker(
        user: User = Depends(_get_user_with_roles),
    ) -> User:
        # Check if user has any of the required roles
        for role_name in roles:
            if _has_role(user, role_name):
                return user

        raise AuthorizationError(
            f"Required role: one of {', '.join(roles)}"
        )

    return role_checker


async def require_agent_or_admin(
    user: User = Depends(_get_user_with_roles),
) -> User:
    """Require technician attribute or admin role for access.

    DEPRECATED: Use require_technician or require_admin instead.
    This is kept for backward compatibility only.

    Args:
        user: Authenticated user with roles loaded

    Returns:
        User object if technician or admin

    Raises:
        AuthorizationError: If user is not technician or admin
    """
    if user.is_technician or _has_role(user, "Admin") or user.is_super_admin:
        return user

    raise AuthorizationError("Technician access or Admin role required")


# =============================================================================
# Deployment Worker Authentication
# =============================================================================


async def require_worker_token(request: Request) -> bool:
    """Require valid deployment worker API token.

    The worker token is sent in the X-Worker-Token header.
    This dependency is used for internal worker APIs that should
    only be accessible to the Rust deployment worker.

    Args:
        request: FastAPI request object

    Returns:
        True if token is valid

    Raises:
        AuthorizationError: If worker endpoints are disabled
        AuthenticationError: If token is missing or invalid
    """
    # Check if worker endpoints are enabled
    if not settings.deployment_worker.enabled:
        raise AuthorizationError("Deployment worker endpoints are disabled")

    # Get token from header
    token = request.headers.get("X-Worker-Token")
    if not token:
        raise AuthenticationError("Worker token required (X-Worker-Token header)")

    # Validate token
    expected_token = settings.deployment_worker.api_token
    if not expected_token:
        raise AuthorizationError(
            "Worker authentication not configured (DEPLOYMENT_WORKER_API_TOKEN not set)"
        )

    if not secrets.compare_digest(token, expected_token):
        raise AuthenticationError("Invalid worker token")

    return True


# =============================================================================
# Service Request Authorization
# =============================================================================


async def verify_request_access(
    request_id,
    user: User,
    db: AsyncSession,
) -> ServiceRequest:
    """Verify that the current user has access to a service request.

    Authorization rules:
    1. Super admins have access to all requests
    2. Technicians have access to all requests (for support purposes)
    3. Requesters can access their own requests
    4. Assigned technicians can access requests assigned to them

    Args:
        request_id: Service request ID (UUID)
        user: Current authenticated user
        db: Database session

    Returns:
        ServiceRequest object if access is granted

    Raises:
        AuthorizationError: If user does not have access to the request
        HTTPException(404): If request is not found
    """
    from uuid import UUID

    # Convert string to UUID if needed
    if isinstance(request_id, str):
        try:
            request_id = UUID(request_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid request ID format"
            )

    # Fetch the service request
    result = await db.execute(
        select(ServiceRequest).where(ServiceRequest.id == request_id)
    )
    service_request = result.scalar_one_or_none()

    if not service_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service request not found"
        )

    # Super admins and technicians have full access
    if user.is_super_admin or user.is_technician:
        return service_request

    # Requester can access their own requests
    if service_request.requester_id == user.id:
        return service_request

    # Assigned technician can access the request
    if service_request.assigned_to_technician_id == user.id:
        return service_request

    # User does not have access
    raise AuthorizationError("You do not have access to this service request")
