"""
Authentication schemas package.

This package contains all schemas related to authentication,
authorization, and token management.
"""

from .login import (ADLoginRequest, AdminLoginRequest, AuthError, DeviceInfo,
                    LoginRequest, LoginResponse, LogoutResponse, SessionInfo,
                    SSOLoginRequest, TokenData, TokenResponse,
                    TokenValidationRequest, TokenValidationResponse, UserLoginInfo)
from .token import (AccessTokenData, TokenIntrospectResponse, TokenMetadata,
                    TokenPayload, TokenSettings)

__all__ = [
    # Login schemas
    "LoginRequest",
    "SSOLoginRequest",
    "ADLoginRequest",
    "AdminLoginRequest",
    "LoginResponse",
    "TokenResponse",
    "TokenData",
    "DeviceInfo",
    "SessionInfo",
    "LogoutResponse",
    "AuthError",
    "TokenValidationRequest",
    "TokenValidationResponse",
    "UserLoginInfo",

    # Token schemas
    "TokenPayload",
    "AccessTokenData",
    "TokenMetadata",
    "TokenIntrospectResponse",
    "TokenSettings",
]
