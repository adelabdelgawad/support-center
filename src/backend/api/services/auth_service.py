"""
Authentication service for passwordless authentication.

This service handles the core authentication logic including
passwordless login, token generation, session management, and validation.

REFACTORED:
- Removed UserRole and SessionType enum imports
- Replaced role=UserRole.EMPLOYEE with is_technician=False
- Replaced session_type=SessionType.DESKTOP with session_type_id=2
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from core.config import settings
from core.security import (
    create_token_pair,
    decode_token,
    generate_device_fingerprint,
    hash_token,
)
from fastapi import HTTPException, status
from api.services.version_policy_service import VersionPolicyService, VersionStatus
from db import AuthToken, RefreshSession, User, DesktopSession, WebSession
from api.services.desktop_session_service import DesktopSessionService
from api.services.web_session_service import WebSessionService
import bcrypt  # Direct bcrypt usage (Finding #27: passlib → bcrypt migration)
from api.schemas.login import (
    ADLoginRequest,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    SessionInfo,
    SSOLoginRequest,
    TokenValidationResponse,
    UserLoginInfo,
)
from api.schemas.domain_user import DomainUser
from api.services.active_directory import LdapService
from crud.active_directory_config_crud import get_active_config as get_ad_config
from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# SECURITY (Finding #27 - passlib → bcrypt migration):
# Direct bcrypt usage for password hashing and verification.
# bcrypt library natively handles the $2b$ prefix and is compatible
# with hashes created by passlib (which also uses bcrypt under the hood).
# No password reset required - existing hashes continue to work.


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using bcrypt.

    SECURITY: This function is backward-compatible with hashes created by passlib.
    Both libraries use bcrypt with the same format ($2b$...).

    Args:
        plain_password: Plain text password to verify
        hashed_password: Bcrypt hash to compare against

    Returns:
        True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: Plain text password to hash

    Returns:
        Bcrypt hash string
    """
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


class AuthenticationService:
    """Service for handling authentication operations."""

    def __init__(self):
        pass

    async def passwordless_login(
        self,
        login_data: LoginRequest,
        db: AsyncSession,
        client_ip: Optional[str] = None,
    ) -> LoginResponse:
        """Perform passwordless authentication login.

        Args:
            login_data: Login request with username and device info
            db: Database session
            client_ip: Client IP address

        Returns:
            LoginResponse with tokens and user data

        Raises:
            HTTPException: If authentication fails
        """
        try:
            # 1. Validate username exists and user is active
            user = await self._validate_user(login_data.username, db)

            # 2. Get device information
            device_info = self._process_device_info(login_data.device_info)

            # 3. Create or update web session (passwordless login is web-only)
            session = await WebSessionService.create_session(
                db=db,
                user_id=user.id,
                ip_address=client_ip or "unknown",
                auth_method="passwordless",
                device_fingerprint=generate_device_fingerprint(user.username, device_info),
                browser=device_info.get("browser"),
                user_agent=device_info.get("user_agent"),
            )

            # 4. Generate long-lived access token (30 days)
            access_token = create_token_pair(user, session)

            # 5. Store access token in database
            await self._store_access_token(
                user_id=user.id,  # Use UUID primary key for auth_tokens table
                session_id=session.id,
                access_token=access_token,
                device_info=device_info,
                db=db,
            )

            # 6. Update session authentication tracking
            await self._update_session_authentication(
                session_id=session.id,
                authenticated_at=datetime.utcnow(),
                last_auth_refresh=datetime.utcnow(),
                device_fingerprint=generate_device_fingerprint(
                    user.username, device_info
                ),
                db=db,
            )

            # 7. Return response with redirect path
            # Determine redirect path: technicians → /support-center/requests, regular users → /ticket
            redirect_to = (
                "/support-center/requests" if user.is_technician else "/ticket"
            )

            return LoginResponse(
                access_token=access_token,
                token_type="bearer",
                expires_in=2592000,  # 30 days in seconds
                session_id=session.id,
                redirect_to=redirect_to,
                user=UserLoginInfo(
                    id=user.id,
                    username=user.username,
                    email=user.email,
                    full_name=user.full_name,
                    is_active=user.is_active,
                    is_technician=user.is_technician,
                    is_super_admin=user.is_super_admin,
                ),
            )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Authentication failed: {str(e)}",
            )

    async def sso_login(
        self,
        login_data: SSOLoginRequest,
        db: AsyncSession,
        client_ip: Optional[str] = None,
    ) -> LoginResponse:
        """
        Perform SSO login (username only).
        Fetches user from database or Active Directory if not found.

        SECURITY (Finding #37 - SSO Username Trust Model):
        The username parameter is UNTRUSTED CLIENT INPUT from the SSO page.
        This method performs AUTHORITATIVE VALIDATION:
        1. Case-insensitive database lookup normalizes the username
        2. Active Directory LDAP validation if user not in database
        3. User is_active and is_blocked checks enforce access control
        4. All authentication attempts are logged with client_ip

        Never trust the client-provided username without validation.
        The backend AD/database lookup is the source of truth.

        Args:
            login_data: SSO login request with username
            db: Database session
            client_ip: Client IP address

        Returns:
            LoginResponse with tokens and user data

        Raises:
            HTTPException: If authentication fails
        """
        import time
        from datetime import timedelta

        login_start = time.time()
        timing_log = {}

        try:
            # 1. Try to get user from database first
            # Use case-insensitive search and strip whitespace
            step_start = time.time()
            username_normalized = login_data.username.strip()
            result = await db.execute(
                select(User).where(
                    func.lower(User.username) == func.lower(username_normalized)
                )
            )
            user = result.scalar_one_or_none()
            timing_log["db_user_lookup"] = time.time() - step_start

            # 2. If user not found in DB, fetch from AD
            if not user:
                # Fetch active AD configuration
                ad_config = await get_ad_config(db)
                if not ad_config:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Active Directory is not configured. Please contact system administrator.",
                    )

                ldap_service = LdapService(ad_config=ad_config)
                domain_user = await ldap_service.get_user_by_username(
                    login_data.username
                )

                if not domain_user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"User {login_data.username} not found in database or Active Directory",
                    )

                # Create new user from AD data
                try:
                    user = await self._create_user_from_ad(domain_user, db)
                except Exception as create_error:
                    # Handle race condition or existing user: user already exists
                    error_str = str(create_error).lower()
                    if (
                        "duplicate key" in error_str
                        or "unique" in error_str
                        or "violates unique constraint" in error_str
                    ):
                        # Rollback the failed transaction
                        await db.rollback()

                        # Fetch the user again with case-insensitive search
                        result = await db.execute(
                            select(User).where(
                                func.lower(User.username)
                                == func.lower(username_normalized)
                            )
                        )
                        user = result.scalar_one_or_none()

                        if not user:
                            # Still not found - something went wrong
                            raise HTTPException(
                                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Failed to retrieve user after creation conflict",
                            )

                        # Update the user with latest AD data
                        if domain_user:
                            user = await self._update_user_from_ad(
                                user, domain_user, db
                            )
                    else:
                        # Re-raise other exceptions
                        raise
            else:
                # User exists in DB - only update from AD if:
                # 1. User is a domain user (is_domain = True)
                # 2. User data is stale (last_seen > 24 hours ago)
                # This optimization significantly reduces login time for frequent logins
                ad_refresh_threshold = timedelta(hours=24)
                needs_ad_refresh = user.is_domain and (
                    not user.last_seen
                    or datetime.utcnow() - user.last_seen > ad_refresh_threshold
                )

                step_start = time.time()
                if needs_ad_refresh:
                    try:
                        # Fetch active AD configuration
                        ad_config = await get_ad_config(db)
                        if not ad_config:
                            raise HTTPException(
                                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Active Directory is not configured. Please contact system administrator.",
                            )

                        ldap_service = LdapService(ad_config=ad_config)
                        domain_user = await ldap_service.get_user_by_username(
                            login_data.username
                        )

                        if domain_user:
                            # Update user with latest AD data
                            user = await self._update_user_from_ad(
                                user, domain_user, db
                            )
                        timing_log["ad_refresh"] = time.time() - step_start
                    except Exception as ad_error:
                        # Log AD error but continue with existing DB user data
                        logging.getLogger(__name__).warning(
                            f"AD lookup failed for {login_data.username}, using DB data: {ad_error}"
                        )
                        timing_log["ad_refresh"] = time.time() - step_start
                else:
                    timing_log["ad_refresh_skipped"] = True
                    logger.debug(
                        f"Skipping AD refresh for {login_data.username} - "
                        f"last_seen: {user.last_seen}"
                    )

            # 3. Validate user is active
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is inactive",
                )

            if user.is_blocked:
                block_msg = user.block_message or "Account is blocked"
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Account is blocked: {block_msg}",
                )

            # 4. Get device information
            device_info = self._process_device_info(login_data.device_info)

            # 4b. Version policy enforcement (if enabled)
            await self._enforce_version_policy(
                app_version=device_info.get("app_version", "1.0.0"),
                platform="desktop",
                db=db,
                username=user.username,
                client_ip=device_info.get("ip_address") or client_ip,
            )

            # 5. Create or update desktop session (SSO is desktop-only)
            step_start = time.time()
            # Prioritize IP from device_info (local IP from Tauri) over client_ip (firewall IP)
            session_ip = device_info.get("ip_address") or client_ip or "unknown"

            logger.info(
                f"Creating desktop session for {user.username} | "
                f"device_info IP: {device_info.get('ip_address')} | "
                f"client_ip (firewall): {client_ip} | "
                f"final session_ip: {session_ip} | "
                f"computer_name: {device_info.get('computer_name')} | "
                f"app_version: {device_info.get('app_version', '1.0.0')} | "
                f"os: {device_info.get('os')}"
            )

            session = await DesktopSessionService.create_session(
                db=db,
                user_id=user.id,
                ip_address=session_ip,
                app_version=device_info.get("app_version", "1.0.0"),  # Required for desktop
                auth_method="sso",
                device_fingerprint=generate_device_fingerprint(user.username, device_info),
                computer_name=device_info.get("computer_name"),
                os_info=device_info.get("os"),
            )
            timing_log["session_create"] = time.time() - step_start

            # 6. Generate long-lived access token (30 days)
            step_start = time.time()
            access_token = create_token_pair(user, session)
            timing_log["token_generate"] = time.time() - step_start

            # 7. Store access token in database
            step_start = time.time()
            await self._store_access_token(
                user_id=user.id,  # Use UUID primary key for auth_tokens table
                session_id=session.id,
                access_token=access_token,
                device_info=device_info,
                db=db,
            )
            timing_log["token_store"] = time.time() - step_start

            # 8. Update session authentication tracking
            step_start = time.time()
            await self._update_session_authentication(
                session_id=session.id,
                authenticated_at=datetime.utcnow(),
                last_auth_refresh=datetime.utcnow(),
                device_fingerprint=generate_device_fingerprint(
                    user.username, device_info
                ),
                db=db,
            )
            timing_log["session_update"] = time.time() - step_start

            # 9. Log total timing for performance monitoring
            timing_log["total"] = time.time() - login_start
            ad_info = (
                f"ad_refresh={timing_log.get('ad_refresh', 0):.3f}s"
                if "ad_refresh" in timing_log
                else "ad_refresh=skipped"
            )
            logger.info(
                f"SSO Login timing for {login_data.username}: "
                f"total={timing_log['total']:.3f}s | "
                f"db_lookup={timing_log.get('db_user_lookup', 0):.3f}s | "
                f"{ad_info} | "
                f"session={timing_log.get('session_create', 0):.3f}s | "
                f"token={timing_log.get('token_generate', 0):.3f}s"
            )

            # 10. Return response with redirect path
            redirect_to = (
                "/support-center/requests" if user.is_technician else "/ticket"
            )

            return LoginResponse(
                access_token=access_token,
                token_type="bearer",
                expires_in=2592000,  # 30 days in seconds
                session_id=session.id,
                redirect_to=redirect_to,
                user=UserLoginInfo(
                    id=user.id,
                    username=user.username,
                    email=user.email,
                    full_name=user.full_name,
                    is_active=user.is_active,
                    is_technician=user.is_technician,
                    is_super_admin=user.is_super_admin,
                ),
            )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"SSO authentication failed: {str(e)}",
            )

    async def ad_login(
        self,
        login_data: ADLoginRequest,
        db: AsyncSession,
        client_ip: Optional[str] = None,
    ) -> LoginResponse:
        """
        Perform Active Directory login (username and password).
        Validates credentials against AD and creates/updates user record.

        Special case: If username is "admin", authenticates locally with password hash.

        Args:
            login_data: AD login request with username and password
            db: Database session
            client_ip: Client IP address

        Returns:
            LoginResponse with tokens and user data

        Raises:
            HTTPException: If authentication fails
        """
        import time

        login_start = time.time()
        timing_log = {}

        try:
            # Special case: Handle "admin" user locally (not via AD)
            if login_data.username.lower() == "admin":
                return await self._authenticate_admin_user(
                    login_data=login_data, db=db, client_ip=client_ip
                )

            # 1. Fetch active AD configuration and authenticate
            step_start = time.time()
            ad_config = await get_ad_config(db)
            if not ad_config:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Active Directory is not configured. Please contact system administrator.",
                )

            ldap_service = LdapService(ad_config=ad_config)
            try:
                is_authenticated = await ldap_service.authenticate_user(
                    login_data.username, login_data.password
                )
            except Exception as ldap_error:
                # Map LDAP errors to user-friendly messages
                error_str = str(ldap_error).lower()

                # Check for common LDAP error codes
                if "52e" in error_str or "invalid credentials" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid username or password",
                    )
                elif "525" in error_str or "user not found" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid username or password",
                    )
                elif "530" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Not permitted to logon at this time",
                    )
                elif "531" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Not permitted to logon at this workstation",
                    )
                elif "532" in error_str or "password expired" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Password has expired",
                    )
                elif "533" in error_str or "account disabled" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Account is disabled",
                    )
                elif "701" in error_str or "account expired" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Account has expired",
                    )
                elif "773" in error_str or "must reset password" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="User must reset password",
                    )
                elif "775" in error_str or "account locked" in error_str:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Account is locked out",
                    )
                else:
                    # Generic error for unknown LDAP issues
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Unable to connect to authentication server",
                    )

            if not is_authenticated:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid username or password",
                )
            timing_log["ldap_auth"] = time.time() - step_start

            # 2. Fetch user details from AD
            step_start = time.time()
            domain_user = await ldap_service.get_user_by_username(login_data.username)
            timing_log["ldap_fetch_user"] = time.time() - step_start

            if not domain_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"User {login_data.username} authenticated but not found in AD",
                )

            # 3. Get or create user in database
            # Use case-insensitive search and strip whitespace
            step_start = time.time()
            username_normalized = login_data.username.strip()
            result = await db.execute(
                select(User).where(
                    func.lower(User.username) == func.lower(username_normalized)
                )
            )
            user = result.scalar_one_or_none()
            timing_log["db_user_lookup"] = time.time() - step_start

            step_start = time.time()
            if not user:
                # Create new user from AD data
                try:
                    user = await self._create_user_from_ad(domain_user, db)
                except Exception as create_error:
                    # Handle race condition or existing user: user already exists
                    error_str = str(create_error).lower()
                    if (
                        "duplicate key" in error_str
                        or "unique" in error_str
                        or "violates unique constraint" in error_str
                    ):
                        # Rollback the failed transaction
                        await db.rollback()

                        # Fetch the user again with case-insensitive search
                        result = await db.execute(
                            select(User).where(
                                func.lower(User.username)
                                == func.lower(username_normalized)
                            )
                        )
                        user = result.scalar_one_or_none()

                        if not user:
                            # Still not found - something went wrong
                            raise HTTPException(
                                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                detail="Failed to retrieve user after creation conflict",
                            )

                        # Update the user with latest AD data
                        user = await self._update_user_from_ad(user, domain_user, db)
                    else:
                        # Re-raise other exceptions
                        raise
            else:
                # Update existing user with latest AD data
                user = await self._update_user_from_ad(user, domain_user, db)
            timing_log["db_user_create_update"] = time.time() - step_start

            # 4. Validate user is active
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is inactive",
                )

            if user.is_blocked:
                block_msg = user.block_message or "Account is blocked"
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Account is blocked: {block_msg}",
                )

            # 5. Get device information
            device_info = self._process_device_info(login_data.device_info)

            # 5b. Version policy enforcement (if enabled)
            await self._enforce_version_policy(
                app_version=device_info.get("app_version", "1.0.0"),
                platform="desktop",
                db=db,
                username=user.username,
                client_ip=device_info.get("ip_address") or client_ip,
            )

            # 6. Create or update desktop session (AD login is desktop-only)
            step_start = time.time()
            # Prioritize IP from device_info (local IP from Tauri) over client_ip (firewall IP)
            session_ip = device_info.get("ip_address") or client_ip or "unknown"

            logger.info(
                f"Creating desktop session for {user.username} (AD) | "
                f"device_info IP: {device_info.get('ip_address')} | "
                f"client_ip (firewall): {client_ip} | "
                f"final session_ip: {session_ip} | "
                f"computer_name: {device_info.get('computer_name')} | "
                f"app_version: {device_info.get('app_version', '1.0.0')} | "
                f"os: {device_info.get('os')}"
            )

            session = await DesktopSessionService.create_session(
                db=db,
                user_id=user.id,
                ip_address=session_ip,
                app_version=device_info.get("app_version", "1.0.0"),  # Required for desktop
                auth_method="ad",
                device_fingerprint=generate_device_fingerprint(user.username, device_info),
                computer_name=device_info.get("computer_name"),
                os_info=device_info.get("os"),
            )
            timing_log["session_create"] = time.time() - step_start

            # 7. Generate long-lived access token (30 days)
            step_start = time.time()
            access_token = create_token_pair(user, session)
            timing_log["token_generate"] = time.time() - step_start

            # 8. Store access token in database
            step_start = time.time()
            await self._store_access_token(
                user_id=user.id,  # Use UUID primary key for auth_tokens table
                session_id=session.id,
                access_token=access_token,
                device_info=device_info,
                db=db,
            )
            timing_log["token_store"] = time.time() - step_start

            # 9. Update session authentication tracking
            step_start = time.time()
            await self._update_session_authentication(
                session_id=session.id,
                authenticated_at=datetime.utcnow(),
                last_auth_refresh=datetime.utcnow(),
                device_fingerprint=generate_device_fingerprint(
                    user.username, device_info
                ),
                db=db,
            )
            timing_log["session_update"] = time.time() - step_start

            # 10. Log total timing for performance monitoring
            timing_log["total"] = time.time() - login_start
            logger.info(
                f"AD Login timing for {login_data.username}: "
                f"total={timing_log['total']:.3f}s | "
                f"ldap_auth={timing_log.get('ldap_auth', 0):.3f}s | "
                f"ldap_fetch={timing_log.get('ldap_fetch_user', 0):.3f}s | "
                f"db_lookup={timing_log.get('db_user_lookup', 0):.3f}s | "
                f"db_update={timing_log.get('db_user_create_update', 0):.3f}s | "
                f"session={timing_log.get('session_create', 0):.3f}s | "
                f"token={timing_log.get('token_generate', 0):.3f}s"
            )

            # 11. Return response with redirect path
            redirect_to = (
                "/support-center/requests" if user.is_technician else "/ticket"
            )

            return LoginResponse(
                access_token=access_token,
                token_type="bearer",
                expires_in=2592000,  # 30 days in seconds
                session_id=session.id,
                redirect_to=redirect_to,
                user=UserLoginInfo(
                    id=user.id,
                    username=user.username,
                    email=user.email,
                    full_name=user.full_name,
                    is_active=user.is_active,
                    is_technician=user.is_technician,
                    is_super_admin=user.is_super_admin,
                ),
            )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"AD authentication failed: {str(e)}",
            )

    async def logout(
        self, credentials, db: AsyncSession, revoke_all: bool = False
    ) -> LogoutResponse:
        """Logout user and revoke tokens.

        Args:
            credentials: HTTP Bearer credentials
            db: Database session
            revoke_all: Whether to revoke all user sessions

        Returns:
            LogoutResponse with session information
        """
        try:
            # Decode token to get user and session info
            payload = decode_token(credentials.credentials)
            user_id = UUID(payload.get("sub"))  # User ID is UUID
            session_id = UUID(payload.get("session_id"))  # Session ID is UUID

            if revoke_all:
                # Revoke all sessions for user
                await self._revoke_all_user_tokens(user_id, db)

                # Mark all desktop sessions as inactive
                await db.execute(
                    update(DesktopSession)
                    .where(DesktopSession.user_id == user_id)
                    .values(is_active=False)
                )

                # Mark all web sessions as inactive
                await db.execute(
                    update(WebSession)
                    .where(WebSession.user_id == user_id)
                    .values(is_active=False)
                )

                await db.commit()

                return LogoutResponse(
                    message="All sessions revoked successfully",
                    session_id=None,
                )
            else:
                # Revoke specific session only
                await self._revoke_session_tokens(session_id, db)

                # Mark session as inactive - try desktop first, then web
                desktop_session = await db.get(DesktopSession, session_id)
                if desktop_session:
                    desktop_session.is_active = False
                    await db.commit()
                else:
                    web_session = await db.get(WebSession, session_id)
                    if web_session:
                        web_session.is_active = False
                        await db.commit()

                return LogoutResponse(
                    message="Session terminated successfully",
                    session_id=session_id,
                )

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Logout failed: {str(e)}",
            )

    async def logout_user(
        self,
        user_id: UUID,
        session_id: UUID,
        db: AsyncSession,
    ) -> None:
        """Logout user by terminating a specific session.

        This method is called by the logout endpoint which has already
        extracted the user_id and session_id from the JWT token.

        Args:
            user_id: ID of the user logging out
            session_id: ID of the session to terminate
            db: Database session

        Raises:
            HTTPException: If logout operation fails
        """
        try:
            # Revoke specific session tokens
            await self._revoke_session_tokens(session_id, db)

            # Mark session as inactive - try desktop first, then web
            desktop_session = await db.get(DesktopSession, session_id)
            if desktop_session:
                desktop_session.is_active = False
                await db.commit()
                logger.info(f"Desktop session {session_id} for user {user_id} terminated successfully")
            else:
                web_session = await db.get(WebSession, session_id)
                if web_session:
                    web_session.is_active = False
                    await db.commit()
                    logger.info(f"Web session {session_id} for user {user_id} terminated successfully")
                else:
                    logger.warning(f"Session {session_id} not found for user {user_id}")

        except Exception as e:
            logger.error(f"Logout failed for user {user_id}, session {session_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Logout failed: {str(e)}",
            )

    async def admin_login(
        self,
        login_data,  # AdminLoginRequest
        db: AsyncSession,
        client_ip: Optional[str] = None,
    ) -> LoginResponse:
        """Local database admin login.

        Allows admin users to authenticate using credentials stored in the
        local database (independent of AD/SSO systems).

        Admin users do NOT require technician role - admin status grants full access.

        Args:
            login_data: Admin login request with username and password
            db: Database session
            client_ip: Client IP address

        Returns:
            LoginResponse with tokens and admin user data

        Raises:
            HTTPException: If admin login fails
        """
        try:
            # Authenticate user using local database password
            result = await self._authenticate_admin_user(
                login_data=login_data,
                db=db,
                client_ip=client_ip,
            )

            # Admin users don't require technician role - just return the result
            # Admin status is sufficient for full access
            return result
        except HTTPException:
            # Re-raise HTTPExceptions from _authenticate_admin_user
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Admin authentication failed: {str(e)}",
            )

    async def validate_token(
        self, token: str, db: AsyncSession
    ) -> TokenValidationResponse:
        """Validate a token and return token information.

        Args:
            token: JWT token to validate
            db: Database session

        Returns:
            TokenValidationResponse with validation results
        """
        try:
            payload = decode_token(token)

            # Check token type
            token_type = payload.get("type")
            user_id = UUID(payload.get("sub"))  # User ID is UUID
            session_id = UUID(payload.get("session_id"))  # Session ID is UUID

            # Get user
            user = await db.get(User, user_id)

            if not user:
                return TokenValidationResponse(
                    valid=False, reason="User not found"
                )

            # Try to get session - check desktop first, then web
            desktop_session = await db.get(DesktopSession, session_id)
            web_session = await db.get(WebSession, session_id) if not desktop_session else None
            session = desktop_session or web_session

            if not session or not session.is_active:
                return TokenValidationResponse(
                    valid=False, reason="Session not found or inactive"
                )

            # Check if token exists in database
            token_hash = hash_token(token)

            if token_type == "access":
                token_record = await db.execute(
                    select(AuthToken).where(
                        and_(
                            AuthToken.token_hash == token_hash,
                            not AuthToken.is_revoked,
                        )
                    )
                )
                token_record = token_record.scalar_one_or_none()
            # Refresh tokens no longer exist - only access tokens are used
            else:
                return TokenValidationResponse(
                    valid=False, reason="Refresh tokens are no longer supported"
                )

            if not token_record:
                return TokenValidationResponse(
                    valid=False, reason="Token not found or revoked"
                )

            # Check expiration
            if token_record.expires_at < datetime.utcnow():
                return TokenValidationResponse(valid=False, reason="Token expired")

            return TokenValidationResponse(
                valid=True,
                user_id=user_id,
                username=user.username,
                session_id=session_id,
                expires_at=token_record.expires_at,
            )

        except Exception as e:
            return TokenValidationResponse(
                valid=False, reason=f"Validation error: {str(e)}"
            )

    async def get_active_sessions(
        self, user_id: int, db: AsyncSession
    ) -> List[SessionInfo]:
        """Get all active sessions for a user.

        Args:
            user_id: User ID
            db: Database session

        Returns:
            List of SessionInfo objects
        """
        # Query desktop sessions
        desktop_result = await db.execute(
            select(DesktopSession).where(
                and_(
                    DesktopSession.user_id == user_id,
                    DesktopSession.is_active,
                )
            )
        )
        desktop_sessions = desktop_result.scalars().all()

        # Query web sessions
        web_result = await db.execute(
            select(WebSession).where(
                and_(
                    WebSession.user_id == user_id,
                    WebSession.is_active,
                )
            )
        )
        web_sessions = web_result.scalars().all()

        # Combine sessions
        session_infos = []

        # Add desktop sessions (type_id = 2)
        for session in desktop_sessions:
            session_infos.append(
                SessionInfo(
                    session_id=session.id,
                    session_type_id=2,  # Desktop
                    ip_address=session.ip_address,
                    authenticated_at=session.authenticated_at,
                    last_auth_refresh=session.last_auth_refresh,
                    is_active=session.is_active,
                    device_fingerprint=session.device_fingerprint,
                )
            )

        # Add web sessions (type_id = 1)
        for session in web_sessions:
            session_infos.append(
                SessionInfo(
                    session_id=session.id,
                    session_type_id=1,  # Web
                    ip_address=session.ip_address,
                    authenticated_at=session.authenticated_at,
                    last_auth_refresh=session.last_auth_refresh,
                    is_active=session.is_active,
                    device_fingerprint=session.device_fingerprint,
                )
            )

        return session_infos

    # revoke_specific_session removed - use logout endpoints for session termination
    # /logout terminates current session, /sessions/{id} DELETE terminates specific session

    # Private helper methods

    def _safe_phone_number(self, phone: Optional[str]) -> Optional[str]:
        """Ensure phone number is a string or None.

        Args:
            phone: Phone number (may be string, int, or None)

        Returns:
            String representation of phone or None
        """
        if phone is None or phone == "":
            return None
        try:
            return str(phone).strip() or None
        except Exception:
            return None

    async def _validate_user(self, username: str, db: AsyncSession) -> User:
        """Validate that user exists, is active, and not blocked."""
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive",
            )

        if user.is_blocked:
            block_msg = user.block_message or "Account is blocked"
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is blocked: {block_msg}",
            )

        return user

    async def _authenticate_admin_user(
        self,
        login_data,  # Can be AdminLoginRequest or ADLoginRequest
        db: AsyncSession,
        client_ip: Optional[str] = None,
    ) -> LoginResponse:
        """
        Authenticate admin user locally with password hash from database.

        Admin users authenticate using local database credentials (username/password)
        independent of AD/SSO systems.

        Args:
            login_data: Login request with username and password
            db: Database session
            client_ip: Client IP address

        Returns:
            LoginResponse with tokens and user data

        Raises:
            HTTPException: If authentication fails
        """
        # 1. Fetch user from database by username (not hardcoded to "admin")
        result = await db.execute(select(User).where(User.username == login_data.username))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        # 2. Verify password hash
        if not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Admin user is not configured properly",
            )

        # SECURITY (Finding #27): Use direct bcrypt verification
        if not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        # 3. Validate user is active and not blocked
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive",
            )

        if user.is_blocked:
            block_msg = user.block_message or "Account is blocked"
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is blocked: {block_msg}",
            )

        # 4. Get device information
        device_info = self._process_device_info(login_data.device_info)

        # 5. Create or update web session (admin login is web-only)
        session = await WebSessionService.create_session(
            db=db,
            user_id=user.id,
            ip_address=client_ip or "unknown",
            auth_method="admin",
            device_fingerprint=generate_device_fingerprint(user.username, device_info),
            browser=device_info.get("browser"),
            user_agent=device_info.get("user_agent"),
        )

        # 6. Generate long-lived access token (30 days)
        access_token = create_token_pair(user, session)

        # 7. Store access token in database
        await self._store_access_token(
            user_id=user.id,  # Use UUID primary key for auth_tokens table
            session_id=session.id,
            access_token=access_token,
            device_info=device_info,
            db=db,
        )

        # 8. Update session authentication tracking
        await self._update_session_authentication(
            session_id=session.id,
            authenticated_at=datetime.utcnow(),
            last_auth_refresh=datetime.utcnow(),
            device_fingerprint=generate_device_fingerprint(user.username, device_info),
            db=db,
        )

        # 9. Return response with redirect path
        redirect_to = "/support-center/requests" if user.is_technician else "/ticket"

        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=2592000,  # 30 days in seconds
            session_id=session.id,
            redirect_to=redirect_to,
            user={
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "is_active": user.is_active,
                "is_technician": user.is_technician,
                "is_super_admin": user.is_super_admin,
            },
        )

    async def _enforce_version_policy(
        self,
        app_version: str,
        platform: str,
        db: AsyncSession,
        username: Optional[str] = None,
        client_ip: Optional[str] = None,
    ) -> None:
        """
        Enforce version policy if enabled.

        ENFORCEMENT BOUNDARY RATIONALE:
        ================================
        This method is called AFTER authentication but BEFORE desktop session creation.
        This boundary was chosen for the following reasons:

        1. SECURITY: User identity must be verified first before we can log who is
           attempting to connect with an outdated version.

        2. NO RETROACTIVE IMPACT: Enforcement only affects NEW session creation attempts.
           Existing active sessions are never terminated or affected. This ensures users
           with active sessions can continue their work even during enforcement rollout.

        3. REVERSIBILITY: Because enforcement is checked at request time (not cached),
           disabling the VERSION_POLICY_ENFORCE_ENABLED flag takes effect immediately
           for subsequent login attempts without requiring any cleanup.

        4. OBSERVABILITY: By enforcing here, we can log the username and client IP
           for rejected attempts, enabling proper audit trails and debugging.

        5. ATOMIC REJECTION: If enforcement rejects the request, no session record
           is created. This keeps the database clean and prevents orphaned records.

        Raises HTTP 426 (Upgrade Required) if:
        - Enforcement is enabled via settings
        - Client version is OUTDATED_ENFORCED (or UNKNOWN if reject_unknown=True)

        When enforcement is disabled, this is a no-op.
        Logs and tracks metrics for all version policy resolutions.
        """
        from core.logging_config import VersionLogger
        from core.metrics import (
            track_version_policy_resolution,
            track_version_enforcement_rejection,
            track_unknown_version_connection,
            track_outdated_enforced_connection,
        )

        version_logger = VersionLogger("auth")

        # Fetch version registry and resolve policy
        version_registry = await VersionPolicyService.get_version_registry(db, platform)
        policy = VersionPolicyService.resolve_version_policy(
            client_version_string=app_version,
            platform=platform,
            version_registry=version_registry,
        )

        # Track the resolution in metrics (regardless of enforcement status)
        track_version_policy_resolution(
            platform=platform,
            version_status=policy.version_status.value,
        )

        # Log and track special statuses (warning-level events)
        if policy.version_status == VersionStatus.UNKNOWN:
            track_unknown_version_connection(platform)
            version_logger.unknown_version_detected(
                version_string=app_version,
                platform=platform,
                username=username,
                ip_address=client_ip,
            )
        elif policy.version_status == VersionStatus.OUTDATED_ENFORCED:
            track_outdated_enforced_connection(platform)
            version_logger.outdated_enforced_detected(
                version_string=app_version,
                target_version=policy.target_version_string or "N/A",
                platform=platform,
                username=username,
                ip_address=client_ip,
            )

        # Skip enforcement if disabled
        if not settings.version_policy.enforce_enabled:
            return

        # Check if we should reject this version
        should_reject = False
        reject_reason = ""

        if policy.version_status == VersionStatus.OUTDATED_ENFORCED:
            if settings.version_policy.reject_outdated_enforced:
                should_reject = True
                reject_reason = "App update required. This version is no longer allowed."

        elif policy.version_status == VersionStatus.UNKNOWN:
            if settings.version_policy.reject_unknown:
                should_reject = True
                reject_reason = "Unknown app version. Please update to a supported version."

        if should_reject:
            # Track rejection in metrics
            track_version_enforcement_rejection(
                platform=platform,
                version_status=policy.version_status.value,
                reason="outdated_enforced" if policy.version_status == VersionStatus.OUTDATED_ENFORCED else "unknown",
            )

            # Log rejection with structured logger (includes installer_url if configured)
            version_logger.enforcement_rejected(
                version_string=app_version,
                version_status=policy.version_status.value,
                target_version=policy.target_version_string,
                platform=platform,
                reason=reject_reason,
                username=username,
                ip_address=client_ip,
                installer_url=policy.installer_url,
            )

            # Structured error response per Phase 7.1 spec.
            # The 'reason' field is the primary identifier for client-side handling.
            # Includes upgrade distribution metadata when configured.
            error_detail = {
                "reason": "version_enforced",  # Spec-required field for client identification
                "target_version": policy.target_version_string,  # Version user must upgrade to
                "message": reject_reason,  # Human-readable explanation
                "version_status": policy.version_status.value,  # Detailed status for debugging
                "current_version": app_version,  # Client's reported version for debugging
            }
            # Include installer metadata if configured (Phase 7.1)
            if policy.installer_url:
                error_detail["installer_url"] = policy.installer_url
            if policy.silent_install_args:
                error_detail["silent_install_args"] = policy.silent_install_args

            raise HTTPException(
                status_code=status.HTTP_426_UPGRADE_REQUIRED,
                detail=error_detail,
            )

    def _process_device_info(
        self, device_info: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Process and standardize device information."""
        if not device_info:
            logger.warning("No device_info provided during authentication")
            return {}

        # Log the raw device info received from client
        logger.info(f"Raw device_info received: {device_info}")

        processed = {}

        # Standard fields
        processed["os"] = device_info.get("os") or "unknown"
        processed["browser"] = device_info.get("browser")
        processed["user_agent"] = device_info.get("user_agent")

        # Desktop-specific fields (CRITICAL for desktop sessions)
        processed["ip_address"] = device_info.get("ip_address")
        processed["computer_name"] = device_info.get("computer_name")
        # app_version: default to "web" for browser-based logins (IT app)
        processed["app_version"] = device_info.get("app_version") or "web"

        logger.info(
            f"Processed device_info: os={processed.get('os')}, "
            f"ip_address={processed.get('ip_address')}, "
            f"computer_name={processed.get('computer_name')}, "
            f"app_version={processed.get('app_version')}"
        )

        return processed

    async def _update_session_authentication(
        self,
        session_id: UUID,
        authenticated_at: datetime,
        last_auth_refresh: datetime,
        device_fingerprint: str,
        db: AsyncSession,
    ) -> None:
        """Update session authentication tracking."""
        # Try updating desktop session first
        desktop_result = await db.execute(
            update(DesktopSession)
            .where(DesktopSession.id == session_id)
            .values(
                authenticated_at=authenticated_at,
                last_auth_refresh=last_auth_refresh,
                device_fingerprint=device_fingerprint,
            )
        )

        # If no desktop session updated, try web session
        if desktop_result.rowcount == 0:
            await db.execute(
                update(WebSession)
                .where(WebSession.id == session_id)
                .values(
                    authenticated_at=authenticated_at,
                    last_auth_refresh=last_auth_refresh,
                    device_fingerprint=device_fingerprint,
                )
            )

        await db.commit()

    def _create_access_token(self, user: User, session: Union[DesktopSession, WebSession]) -> str:
        """Create access token for user and session."""
        # This would use the security module to create the token
        from core.security import create_access_token

        return create_access_token(user, session)

    async def _store_access_token(
        self,
        user_id: UUID,  # User ID is UUID
        session_id: UUID,  # Session ID is UUID
        access_token: str,
        device_info: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """Store new long-lived access token."""
        # Note: user_id should be UUID for auth_tokens table
        # First, revoke old access tokens for this session
        await db.execute(
            update(AuthToken)
            .where(
                and_(
                    AuthToken.session_id == session_id,
                    not AuthToken.is_revoked,
                )
            )
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )

        # Store new long-lived access token (30 days)
        access_token_record = AuthToken(
            user_id=user_id,
            session_id=session_id,
            token_hash=hash_token(access_token),
            token_type="access",
            device_info=device_info,
            expires_at=datetime.utcnow() + timedelta(days=30),
        )

        db.add(access_token_record)
        await db.commit()

    async def _revoke_session_tokens(self, session_id: UUID, db: AsyncSession) -> int:
        """Revoke all tokens for a specific session."""
        # Revoke access tokens only (refresh tokens no longer exist)
        access_result = await db.execute(
            update(AuthToken)
            .where(AuthToken.session_id == session_id)
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )

        await db.commit()

        # Return count of affected rows
        return access_result.rowcount

    async def _revoke_all_user_tokens(self, user_id: UUID, db: AsyncSession) -> int:
        """Revoke all tokens for a user."""
        # Revoke access tokens only (refresh tokens no longer exist)
        access_result = await db.execute(
            update(AuthToken)
            .where(AuthToken.user_id == user_id)
            .values(is_revoked=True, revoked_at=datetime.utcnow())
        )

        await db.commit()

        # Return count of affected rows
        return access_result.rowcount

    async def cleanup_expired_tokens(
        self, db: AsyncSession, retention_days: int = 7
    ) -> Dict[str, int]:
        """
        Clean up expired and revoked auth tokens.

        Removes tokens that are:
        - Expired (expires_at < now) AND older than retention period
        - Revoked (is_revoked = True) AND older than retention period

        Retention period allows keeping old tokens for audit trail.

        Args:
            db: Database session
            retention_days: Days to keep expired/revoked tokens for audit (default: 7)

        Returns:
            Dict with counts of deleted tokens by category
        """
        now = datetime.utcnow()
        retention_cutoff = now - timedelta(days=retention_days)

        logger.info(
            f"Starting auth token cleanup | Retention: {retention_days} days | "
            f"Cutoff: {retention_cutoff.isoformat()}"
        )

        # Count tokens before cleanup
        total_before = await db.execute(select(func.count()).select_from(AuthToken))
        total_count_before = total_before.scalar()

        # Delete expired tokens older than retention period
        expired_result = await db.execute(
            delete(AuthToken)
            .where(AuthToken.expires_at < now)
            .where(AuthToken.created_at < retention_cutoff)
        )
        expired_deleted = expired_result.rowcount

        # Delete revoked tokens older than retention period
        revoked_result = await db.execute(
            delete(AuthToken)
            .where(AuthToken.is_revoked)
            .where(AuthToken.created_at < retention_cutoff)
        )
        revoked_deleted = revoked_result.rowcount

        await db.commit()

        # Count tokens after cleanup
        total_after = await db.execute(select(func.count()).select_from(AuthToken))
        total_count_after = total_after.scalar()

        total_deleted = total_count_before - total_count_after

        logger.info(
            f"Auth token cleanup completed | "
            f"Total deleted: {total_deleted} | "
            f"Expired: {expired_deleted} | "
            f"Revoked: {revoked_deleted} | "
            f"Remaining: {total_count_after}"
        )

        return {
            "total_deleted": total_deleted,
            "expired_deleted": expired_deleted,
            "revoked_deleted": revoked_deleted,
            "total_before": total_count_before,
            "total_after": total_count_after,
        }

    async def cleanup_expired_refresh_sessions(
        self, db: AsyncSession, retention_days: int = 7
    ) -> Dict[str, int]:
        """
        Clean up expired and revoked refresh sessions.

        Removes sessions that are:
        - Expired (expires_at < now) AND older than retention period
        - Revoked (revoked = True) AND older than retention period

        Retention period allows keeping old sessions for audit trail.

        Args:
            db: Database session
            retention_days: Days to keep expired/revoked sessions for audit (default: 7)

        Returns:
            Dict with counts of deleted sessions by category
        """
        now = datetime.utcnow()
        retention_cutoff = now - timedelta(days=retention_days)

        logger.info(
            f"Starting refresh session cleanup | Retention: {retention_days} days | "
            f"Cutoff: {retention_cutoff.isoformat()}"
        )

        # Count sessions before cleanup
        total_before = await db.execute(select(func.count()).select_from(RefreshSession))
        total_count_before = total_before.scalar()

        # Delete expired sessions older than retention period
        expired_result = await db.execute(
            delete(RefreshSession)
            .where(RefreshSession.expires_at < now)
            .where(RefreshSession.created_at < retention_cutoff)
        )
        expired_deleted = expired_result.rowcount

        # Delete revoked sessions older than retention period
        revoked_result = await db.execute(
            delete(RefreshSession)
            .where(RefreshSession.revoked)
            .where(RefreshSession.created_at < retention_cutoff)
        )
        revoked_deleted = revoked_result.rowcount

        await db.commit()

        # Count sessions after cleanup
        total_after = await db.execute(select(func.count()).select_from(RefreshSession))
        total_count_after = total_after.scalar()

        total_deleted = total_count_before - total_count_after

        logger.info(
            f"Refresh session cleanup completed | "
            f"Total deleted: {total_deleted} | "
            f"Expired: {expired_deleted} | "
            f"Revoked: {revoked_deleted} | "
            f"Remaining: {total_count_after}"
        )

        return {
            "total_deleted": total_deleted,
            "expired_deleted": expired_deleted,
            "revoked_deleted": revoked_deleted,
            "total_before": total_count_before,
            "total_after": total_count_after,
        }

    async def cleanup_all_expired_sessions(
        self, db: AsyncSession, retention_days: int = 7
    ) -> Dict[str, Any]:
        """
        Clean up both auth tokens and refresh sessions in a single operation.

        This is a convenience method that calls both cleanup functions and
        returns combined statistics.

        Args:
            db: Database session
            retention_days: Days to keep expired/revoked items for audit (default: 7)

        Returns:
            Dict with combined cleanup statistics
        """
        logger.info(
            f"Starting combined session cleanup | Retention: {retention_days} days"
        )

        # Clean up auth tokens
        token_results = await self.cleanup_expired_tokens(db, retention_days)

        # Clean up refresh sessions
        session_results = await self.cleanup_expired_refresh_sessions(db, retention_days)

        combined_results = {
            "auth_tokens": token_results,
            "refresh_sessions": session_results,
            "total_deleted": token_results["total_deleted"] + session_results["total_deleted"],
        }

        logger.info(
            f"Combined session cleanup completed | "
            f"Total deleted: {combined_results['total_deleted']} "
            f"(Tokens: {token_results['total_deleted']}, Sessions: {session_results['total_deleted']})"
        )

        return combined_results

    async def _create_user_from_ad(
        self, domain_user: DomainUser, db: AsyncSession
    ) -> User:
        """
        Create a new user record from Active Directory data.

        Args:
            domain_user: DomainUser object from AD
            db: Database session

        Returns:
            Created User object
        """
        # Get manager user ID if manager_username exists
        manager_id = None
        if domain_user.manager_username:
            manager_result = await db.execute(
                select(User).where(User.username == domain_user.manager_username)
            )
            manager = manager_result.scalar_one_or_none()
            if manager:
                manager_id = manager.id

        # Create new user
        new_user = User(
            username=domain_user.username,
            email=domain_user.email or f"{domain_user.username}@domain.local",
            full_name=domain_user.full_name,
            phone_number=self._safe_phone_number(domain_user.phone_number),
            is_technician=False,  # Default to non-technician for AD users
            is_domain=True,  # Mark as domain user
            is_active=True,
            manager_id=manager_id,
            direct_manager_name=domain_user.direct_manager_name,
            title=domain_user.title,
            office=domain_user.office,
            password_hash=None,  # No password for domain users
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return new_user

    async def _update_user_from_ad(
        self, user: User, domain_user: DomainUser, db: AsyncSession
    ) -> User:
        """
        Update existing user record with latest Active Directory data.

        Args:
            user: Existing User object
            domain_user: DomainUser object from AD
            db: Database session

        Returns:
            Updated User object
        """
        # Update user fields with latest AD data
        user.email = domain_user.email or user.email
        user.full_name = domain_user.full_name or user.full_name
        user.phone_number = (
            self._safe_phone_number(domain_user.phone_number) or user.phone_number
        )
        user.title = domain_user.title or user.title
        user.office = domain_user.office or user.office
        user.direct_manager_name = (
            domain_user.direct_manager_name or user.direct_manager_name
        )

        # Get manager user ID if manager_username exists
        if domain_user.manager_username:
            manager_result = await db.execute(
                select(User).where(User.username == domain_user.manager_username)
            )
            manager = manager_result.scalar_one_or_none()
            if manager:
                user.manager_id = manager.id

        # Mark as domain user
        user.is_domain = True

        await db.commit()
        await db.refresh(user)

        return user


# Global instance
auth_service = AuthenticationService()
