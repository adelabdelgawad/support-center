"""
Authentication schemas for passwordless authentication system.

This module contains Pydantic schemas for authentication operations
including login requests and token responses.

REFACTORED:
- Removed UserRole enum import (replaced with is_technician boolean)
- Removed refresh token mechanisms (sessions are permanent with long-lived access tokens)
"""

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from core.schema_base import HTTPSchemaModel
from pydantic import Field


class LoginRequest(HTTPSchemaModel):
    """Schema for passwordless login request."""

    username: str = Field(..., min_length=3, max_length=50)
    device_info: Optional[Dict[str, Any]] = Field(
        default=None, description="Device information"
    )
    ip_address: Optional[str] = Field(
        default=None, description="Client IP address"
    )


class TokenResponse(HTTPSchemaModel):
    """Schema for token response."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(
        ..., description="Token expiration time in seconds"
    )


class UserLoginInfo(HTTPSchemaModel):
    """User information returned in login response."""

    id: UUID = Field(..., description="User ID")
    username: str = Field(..., description="Username")
    email: str = Field(..., description="Email address")
    full_name: Optional[str] = Field(None, description="Full name")
    is_active: bool = Field(..., description="Whether user is active")
    is_technician: bool = Field(..., description="Whether user is a technician")
    is_super_admin: bool = Field(default=False, description="Whether user is a super admin")


class LoginResponse(TokenResponse):
    """Schema for login response with user and session information."""

    session_id: UUID = Field(..., description="Session ID")
    redirect_to: str = Field(
        ...,
        description="Frontend path to redirect to after login (e.g., /requests, /support-center)",
    )
    user: UserLoginInfo = Field(..., description="User information")


class TokenData(HTTPSchemaModel):
    """Schema for parsed token data."""

    sub: UUID = Field(..., description="User ID")
    username: str = Field(..., description="Username")
    is_technician: bool = Field(
        default=False, description="Whether user is a technician"
    )
    session_id: Optional[UUID] = Field(default=None, description="Session ID")
    device_id: Optional[str] = Field(
        default=None, description="Device identifier"
    )
    type: str = Field(..., description="Token type (access)")
    iat: int = Field(..., description="Issued at timestamp")
    exp: int = Field(..., description="Expiration timestamp")
    jti: UUID = Field(..., description="JWT ID")


class DeviceInfo(HTTPSchemaModel):
    """Schema for device information."""

    os: Optional[str] = Field(default=None, description="Operating system")
    browser: Optional[str] = Field(
        default=None, description="Browser information"
    )
    user_agent: Optional[str] = Field(
        default=None, description="User agent string"
    )
    device_fingerprint: Optional[str] = Field(
        default=None, description="Device fingerprint"
    )
    app_version: Optional[str] = Field(
        default=None, max_length=50, description="Client application version"
    )


class SessionInfo(HTTPSchemaModel):
    """Schema for session information."""

    session_id: UUID
    session_type_id: int
    ip_address: str
    authenticated_at: Optional[datetime]
    last_auth_refresh: Optional[datetime]
    is_active: bool
    device_fingerprint: Optional[str]


class LogoutResponse(HTTPSchemaModel):
    """Schema for logout response."""

    message: str = Field(..., description="Logout message")
    session_id: Optional[UUID] = Field(
        default=None, description="Session that was terminated"
    )


class AuthError(HTTPSchemaModel):
    """Schema for authentication errors."""

    error: str = Field(..., description="Error type")
    detail: str = Field(..., description="Error details")
    code: Optional[int] = Field(default=None, description="Error code")


class TokenValidationRequest(HTTPSchemaModel):
    """Schema for token validation request."""

    token: str = Field(..., description="Token to validate")


class TokenValidationResponse(HTTPSchemaModel):
    """Schema for token validation response."""

    valid: bool = Field(..., description="Whether token is valid")
    user_id: Optional[UUID] = Field(
        default=None, description="User ID if valid"
    )
    username: Optional[str] = Field(
        default=None, description="Username if valid"
    )
    session_id: Optional[UUID] = Field(
        default=None, description="Session ID if valid"
    )
    expires_at: Optional[datetime] = Field(
        default=None, description="Expiration time if valid"
    )


# TokenRevocationRequest removed - use logout endpoint for session termination


class SSOLoginRequest(HTTPSchemaModel):
    """Schema for SSO login request (username only)."""

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Username for SSO authentication",
    )
    device_info: Optional[Dict[str, Any]] = Field(
        default=None, description="Device information"
    )
    ip_address: Optional[str] = Field(
        default=None, description="Client IP address"
    )


class ADLoginRequest(HTTPSchemaModel):
    """Schema for Active Directory login request (username and password)."""

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Username for AD authentication",
    )
    password: str = Field(
        ..., min_length=1, description="Password for AD authentication"
    )
    device_info: Optional[Dict[str, Any]] = Field(
        default=None, description="Device information"
    )
    ip_address: Optional[str] = Field(
        default=None, description="Client IP address"
    )


class AdminLoginRequest(HTTPSchemaModel):
    """Schema for local admin login request (username and password from database).

    Used for admin users who authenticate against local database instead of AD/SSO.
    This allows admins to log in independently without AD credentials.
    """

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Admin username",
    )
    password: str = Field(
        ..., min_length=1, description="Admin password (from local database)"
    )
    device_info: Optional[Dict[str, Any]] = Field(
        default=None, description="Device information"
    )
    ip_address: Optional[str] = Field(
        default=None, description="Client IP address"
    )
