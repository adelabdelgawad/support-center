"""
Token schemas for JWT token handling.

This module contains schemas for token operations including
token generation and validation.
"""
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from core.schema_base import HTTPSchemaModel
from pydantic import Field


class TokenPayload(HTTPSchemaModel):
    """Schema for JWT token payload."""
    sub: UUID = Field(..., description="Subject (user ID)")
    username: str = Field(..., description="Username")
    role: str = Field(..., description="User role")
    session_id: UUID = Field(..., description="Session ID")
    device_id: Optional[str] = Field(
        default=None, description="Device identifier")
    type: str = Field(..., description="Token type (access)")
    iat: int = Field(..., description="Issued at timestamp")
    exp: int = Field(..., description="Expiration timestamp")
    jti: UUID = Field(..., description="JWT ID")


class AccessTokenData(HTTPSchemaModel):
    """Schema for access token data."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Expiration time in seconds")
    scope: Optional[str] = Field(default=None, description="Token scope")


# RefreshTokenData and TokenPair schemas removed - sessions are now permanent with long-lived access tokens


class TokenMetadata(HTTPSchemaModel):
    """Schema for token metadata."""
    token_id: UUID = Field(..., description="Unique token identifier")
    user_id: UUID = Field(..., description="User ID")
    session_id: UUID = Field(..., description="Session ID")
    token_type: str = Field(..., description="Token type")
    created_at: datetime = Field(..., description="Creation timestamp")
    expires_at: datetime = Field(..., description="Expiration timestamp")
    last_used_at: Optional[datetime] = Field(
        default=None, description="Last usage timestamp")
    is_revoked: bool = Field(
        default=False, description="Whether token is revoked")
    revoked_at: Optional[datetime] = Field(
        default=None, description="Revocation timestamp")
    device_info: Optional[Dict[str, Any]] = Field(
        default=None, description="Device information")


# TokenRotationInfo schema removed - tokens are no longer rotated


# TokenRevocationStatus removed - use logout response for session termination status


class TokenIntrospectResponse(HTTPSchemaModel):
    """Schema for token introspection response."""
    active: bool = Field(..., description="Whether token is active")
    scope: Optional[str] = Field(default=None, description="Token scope")
    client_id: Optional[str] = Field(default=None, description="Client ID")
    username: Optional[str] = Field(default=None, description="Username")
    token_type: Optional[str] = Field(default=None, description="Token type")
    exp: Optional[int] = Field(
        default=None, description="Expiration timestamp")
    iat: Optional[int] = Field(default=None, description="Issued at timestamp")
    nbf: Optional[int] = Field(
        default=None, description="Not before timestamp")
    sub: Optional[str] = Field(default=None, description="Subject")
    aud: Optional[str] = Field(default=None, description="Audience")


class TokenSettings(HTTPSchemaModel):
    """Schema for token generation settings."""
    access_token_expire_days: int = Field(
        default=30, description="Access token expiration in days (permanent session)")
    algorithm: str = Field(default="HS256", description="JWT algorithm")
    secret_key: str = Field(..., description="Secret key for signing")
    issuer: str = Field(default="service-catalog", description="Token issuer")
    audience: Optional[str] = Field(default=None, description="Token audience")
