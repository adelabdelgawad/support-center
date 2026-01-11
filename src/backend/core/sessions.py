"""Session helpers for stateful authentication with refresh tokens.

This module provides utilities for creating and validating JWT tokens
for the enhanced session management system with refresh token support.

Based on the template's session.py implementation.

NOTE: Migrated from python-jose to pyjwt for security (CVE-2022-29217).
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

import jwt
from jwt.exceptions import PyJWTError

from core.config import settings


def generate_uuid() -> str:
    """
    Generate a UUID v4 string.

    Returns:
        UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
    """
    return str(uuid.uuid4())


def issue_access_token(
    user_id: str,
    username: str,
    scopes: list[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> Tuple[str, str]:
    """
    Issue an access token JWT.

    Args:
        user_id: User UUID as string
        username: Username for the 'sub' claim
        scopes: List of permission scopes
        expires_delta: Optional custom expiration delta

    Returns:
        Tuple of (access_token, jti)
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.security.session_access_token_minutes)

    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    jti = generate_uuid()

    payload = {
        "sub": username,
        "user_id": user_id,
        "scopes": scopes or ["user"],
        "exp": expire,
        "iat": now,
        "jti": jti,
        "type": "access",
        "iss": settings.security.jwt_issuer,
        "aud": settings.security.jwt_audience,
    }

    token = jwt.encode(
        payload, settings.security.jwt_secret_key_property, algorithm=settings.security.algorithm
    )
    return token, jti


def verify_access_token(token: str) -> Optional[dict]:
    """
    Verify and decode an access token.

    Args:
        token: JWT access token string

    Returns:
        Decoded payload dict or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.security.jwt_secret_key_property,
            algorithms=[settings.security.algorithm],
            audience=settings.security.jwt_audience,
            issuer=settings.security.jwt_issuer,
        )
        # Validate token type
        if payload.get("type") != "access":
            return None
        return payload
    except PyJWTError:
        return None


def create_refresh_cookie_value(
    user_id: str,
    username: str,
    scopes: List[str] = None,
    roles: List[str] = None,
    locale: str = None,
    expires_delta: Optional[timedelta] = None,
) -> Tuple[str, str, datetime]:
    """
    Create a refresh token JWT for use in HttpOnly cookies.

    Args:
        user_id: User UUID as string
        username: Username for the 'sub' claim
        scopes: User scopes (e.g., ['admin', 'user'])
        roles: User roles (e.g., ['admin', 'user'])
        locale: User's preferred locale (e.g., 'en', 'ar')
        expires_delta: Optional custom expiration delta

    Returns:
        Tuple of (refresh_token, jti, expires_at)
    """
    if expires_delta is None:
        expires_delta = timedelta(days=settings.security.session_refresh_lifetime_days)

    now = datetime.now(timezone.utc)
    expires_at = now + expires_delta
    jti = generate_uuid()

    payload = {
        "sub": username,
        "user_id": user_id,
        "exp": expires_at,
        "iat": now,
        "jti": jti,
        "type": "refresh",
        "scopes": scopes or ["user"],
        "roles": roles or ["user"],
        "locale": locale or "en",
        "iss": settings.security.jwt_issuer,
        "aud": settings.security.jwt_audience,
    }

    token = jwt.encode(
        payload, settings.security.jwt_secret_key_property, algorithm=settings.security.algorithm
    )
    return token, jti, expires_at


def verify_refresh_token(token: str) -> Optional[dict]:
    """
    Verify and decode a refresh token.

    Args:
        token: JWT refresh token string

    Returns:
        Decoded payload dict or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.security.jwt_secret_key_property,
            algorithms=[settings.security.algorithm],
            audience=settings.security.jwt_audience,
            issuer=settings.security.jwt_issuer,
        )
        # Validate token type
        if payload.get("type") != "refresh":
            return None
        return payload
    except PyJWTError:
        return None


def hash_fingerprint(fingerprint: str) -> str:
    """
    Hash a device fingerprint using SHA-256.

    Args:
        fingerprint: Raw fingerprint string (e.g., User-Agent + IP + Accept-Language)

    Returns:
        Hexadecimal hash digest (64 characters)
    """
    return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()


def create_fingerprint_from_request(
    user_agent: Optional[str],
    ip_address: Optional[str],
    accept_language: Optional[str] = None,
) -> str:
    """
    Create a device fingerprint from request headers.

    Args:
        user_agent: User-Agent header
        ip_address: Client IP address
        accept_language: Optional Accept-Language header

    Returns:
        Hashed fingerprint
    """
    components = [
        user_agent or "unknown",
        ip_address or "unknown",
        accept_language or "unknown",
    ]
    raw_fingerprint = "|".join(components)
    return hash_fingerprint(raw_fingerprint)


def get_client_ip(request) -> Optional[str]:
    """
    Extract client IP address from request, accounting for proxies.

    Args:
        request: FastAPI Request object

    Returns:
        Client IP address or None
    """
    # Check X-Forwarded-For header first (for proxies/load balancers)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # Take the first IP in the chain
        return forwarded_for.split(",")[0].strip()

    # Check X-Real-IP header (Nginx proxy)
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # Fall back to direct client address
    if request.client:
        return request.client.host

    return None


def parse_user_agent(request) -> Optional[str]:
    """
    Extract User-Agent from request.

    Args:
        request: FastAPI Request object

    Returns:
        User-Agent string or None
    """
    return request.headers.get("user-agent")
