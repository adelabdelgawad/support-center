"""
Security utilities for JWT token generation and validation.

This module provides functions for creating and validating JWT tokens
for the passwordless authentication system.
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union
from uuid import UUID, uuid4

from core.config import settings
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from db import User, DesktopSession, WebSession


class SecurityError(Exception):
    """Base exception for security-related errors."""

    pass


class TokenExpiredError(SecurityError):
    """Raised when a token has expired."""

    pass


class TokenInvalidError(SecurityError):
    """Raised when a token is invalid."""

    pass


class TokenRevokedError(SecurityError):
    """Raised when a token has been revoked."""

    pass


def create_access_token(
    user: User, session: Union[DesktopSession, WebSession], expires_delta: Optional[timedelta] = None
) -> str:
    """Create a JWT access token for the given user and session.

    Args:
        user: User object for token payload
        session: DesktopSession or WebSession object for session tracking
        expires_delta: Custom expiration time delta (default: 30 days for permanent session)

    Returns:
        JWT access token string

    Raises:
        SecurityError: If token creation fails
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # Long-lived token for permanent session (30 days)
        expire = datetime.now(timezone.utc) + timedelta(days=30)

    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),  # Use UUID ID (User.id is now UUID primary key)
        "username": user.username,
        "session_id": str(session.id),
        "device_id": f"session-{session.id}",
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": str(uuid4()),
        "iss": settings.security.jwt_issuer,
        "aud": settings.security.jwt_audience,
        "is_technician": user.is_technician,
        "is_super_admin": user.is_super_admin,
    }

    try:
        token = jwt.encode(
            payload,
            settings.security.jwt_secret_key_property,
            algorithm=settings.security.algorithm,
        )
        return token
    except Exception as e:
        raise SecurityError(f"Failed to create access token: {str(e)}")


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT token.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload

    Raises:
        TokenExpiredError: If token has expired
        TokenInvalidError: If token is invalid
        SecurityError: For other security issues
    """
    try:
        payload = jwt.decode(
            token,
            settings.security.jwt_secret_key_property,
            algorithms=[settings.security.algorithm],
            audience=settings.security.jwt_audience,
            issuer=settings.security.jwt_issuer,
        )
        return payload
    except ExpiredSignatureError:
        raise TokenExpiredError("Token has expired")
    except InvalidTokenError as e:
        raise TokenInvalidError(f"Invalid token: {str(e)}")
    except Exception as e:
        raise SecurityError(f"Token decode error: {str(e)}")


def hash_token(token: str) -> str:
    """Create a secure hash of a token for storage.

    Args:
        token: Token string to hash

    Returns:
        SHA-256 hash of the token
    """
    return hashlib.sha256(token.encode()).hexdigest()


def is_token_expired(payload: Dict[str, Any]) -> bool:
    """Check if a token is expired based on its payload.

    Args:
        payload: Decoded token payload

    Returns:
        True if token is expired, False otherwise
    """
    exp = payload.get("exp")
    if not exp:
        return True

    return datetime.now(timezone.utc).timestamp() >= exp


def extract_token_type(payload: Dict[str, Any]) -> str:
    """Extract token type from payload.

    Args:
        payload: Decoded token payload

    Returns:
        Token type string ("access")
    """
    return payload.get("type", "")


def get_user_id_from_token(payload: Dict[str, Any]) -> str:
    """Extract user ID from token payload.

    Args:
        payload: Decoded token payload

    Returns:
        User ID as UUID string

    Raises:
        TokenInvalidError: If user ID is missing or invalid
    """
    sub = payload.get("sub")
    if not sub:
        raise TokenInvalidError("User ID missing from token")

    # Return as string (UUID format) - will be converted to UUID by caller if needed
    return str(sub)


def get_session_id_from_token(payload: Dict[str, Any]) -> str:
    """Extract session ID from token payload.

    Args:
        payload: Decoded token payload

    Returns:
        Session ID as UUID string

    Raises:
        TokenInvalidError: If session ID is missing or invalid
    """
    session_id = payload.get("session_id")
    if not session_id:
        raise TokenInvalidError("Session ID missing from token")

    # Validate it's a valid UUID string
    try:
        UUID(session_id)
        return session_id
    except (ValueError, AttributeError):
        raise TokenInvalidError("Invalid session ID in token (must be UUID)")


def generate_device_fingerprint(
    username: str, device_info: Optional[Dict[str, Any]] = None
) -> str:
    """Generate a stable device fingerprint for session tracking.

    For desktop sessions, creates a stable fingerprint based on:
    - username
    - computer_name (most important for desktop identification)
    - os (helps distinguish multiple machines)

    NOTE: Fingerprint MUST be stable across logins for proper session reuse.

    Args:
        username: Username for fingerprint generation
        device_info: Optional device information

    Returns:
        Stable device fingerprint string (16 chars)
    """
    # Start with username
    fingerprint_parts = [username]

    if device_info:
        # For desktop sessions, use stable identifiers only
        # DO NOT include timestamp or random values - fingerprint must be stable!

        # Computer name is the most important for desktop sessions
        computer_name = device_info.get("computer_name")
        if computer_name:
            fingerprint_parts.append(computer_name)

        # OS info helps distinguish multiple machines
        os_info = device_info.get("os")
        if os_info:
            fingerprint_parts.append(os_info)

        # Browser info (for web sessions)
        browser = device_info.get("browser")
        if browser:
            fingerprint_parts.append(browser)

    # Join parts and hash for consistent length
    data = "|".join(fingerprint_parts)

    return hashlib.sha256(data.encode()).hexdigest()[:16]


def verify_token_integrity(
    token: str, expected_jti: Optional[str] = None
) -> bool:
    """Verify token integrity and optional JWT ID.

    Args:
        token: Token to verify
        expected_jti: Expected JWT ID to match

    Returns:
        True if token is valid

    Raises:
        TokenInvalidError: If token integrity check fails
    """
    payload = decode_token(token)

    if expected_jti:
        jti = payload.get("jti")
        if jti != expected_jti:
            raise TokenInvalidError("Token JWT ID mismatch")

    return True


def create_token_pair(user: User, session: Union[DesktopSession, WebSession]) -> str:
    """Create a long-lived access token for permanent session.

    Args:
        user: User object
        session: DesktopSession or WebSession object

    Returns:
        Long-lived access token (30 days expiry)
    """
    access_token = create_access_token(user, session)
    return access_token


def get_token_claims(token: str) -> Dict[str, Any]:
    """
    INTERNAL/DEBUG ONLY: Extract claims from JWT without signature verification.

    WARNING: This function does NOT verify the token signature.
    NEVER use this for authentication - use decode_token() instead.
    Only use for debugging or extracting non-sensitive metadata.

    Args:
        token: JWT token string

    Returns:
        Dictionary of token claims (unverified)

    Raises:
        No exceptions - returns empty dict on any error
    """
    try:
        # Decode without validation for claims extraction
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload
    except Exception:
        return {}


def create_temporary_token(
    user_id: int, username: str, session_id: int, expires_seconds: int = 300
) -> str:
    """Create a temporary token for specific operations.

    Args:
        user_id: User ID
        username: Username
        session_id: Session ID
        expires_seconds: Expiration time in seconds (default 5 minutes)

    Returns:
        Temporary JWT token
    """
    expire = datetime.now(timezone.utc) + timedelta(seconds=expires_seconds)
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "username": username,
        "session_id": str(session_id),
        "type": "temporary",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": str(uuid4()),
        "iss": "service-catalog",
        "aud": "it-service-catalog-temp",
    }

    try:
        token = jwt.encode(
            payload,
            settings.security.jwt_secret_key_property,
            algorithm=settings.security.algorithm,
        )
        return token
    except Exception as e:
        raise SecurityError(f"Failed to create temporary token: {str(e)}")
