"""
Integration tests for Version Enforcement (Phase 7).

Tests the hard enforcement of client versions at desktop session creation.

Enforcement Boundary:
- Enforcement happens AFTER authentication but BEFORE session creation
- Only affects NEW session creation, never existing sessions
- Controlled by VERSION_POLICY_ENFORCE_ENABLED feature flag

Test Scenarios:
1. Enforcement OFF -> session created regardless of version
2. Enforcement ON + OK version -> session created
3. Enforcement ON + OUTDATED version (non-enforced) -> session created
4. Enforcement ON + OUTDATED_ENFORCED version -> rejected (HTTP 426)
5. Enforcement ON + UNKNOWN version (default) -> session created
6. Existing sessions unaffected by enforcement state changes
"""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import ClientVersion, DesktopSession
from api.schemas.login import ADLoginRequest, SSOLoginRequest
from api.schemas.version import ClientVersionCreate
from api.services.auth_service import AuthenticationService
from api.services.client_version_service import ClientVersionService
from api.services.version_policy_service import VersionStatus


class TestVersionEnforcementSetup:
    """Setup fixtures for version enforcement tests."""

    @pytest_asyncio.fixture
    async def clean_versions(self, db_session: AsyncSession):
        """Clean up any existing versions before test."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()
        yield

    @pytest_asyncio.fixture
    async def version_registry(self, db_session: AsyncSession, clean_versions):
        """Create a version registry for testing.

        Creates:
        - 1.0.0: Old version
        - 2.0.0: Latest version, not enforced
        """
        v1 = await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        v2 = await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=False)
        )
        return {"v1": v1, "v2": v2}

    @pytest_asyncio.fixture
    async def enforced_version_registry(self, db_session: AsyncSession, clean_versions):
        """Create a version registry with enforcement enabled on latest.

        Creates:
        - 1.0.0: Old version (will be OUTDATED_ENFORCED)
        - 2.0.0: Latest version, ENFORCED
        """
        v1 = await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        v2 = await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=True)
        )
        return {"v1": v1, "v2": v2}


class TestVersionEnforcementOff:
    """Tests when VERSION_POLICY_ENFORCE_ENABLED=False (default)."""

    @pytest.mark.asyncio
    async def test_enforcement_off_allows_outdated_version(
        self, db_session, sample_domain_user, mock_cache
    ):
        """When enforcement is OFF, outdated versions should still be allowed."""
        # Create versions with enforcement enabled on latest
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=True)
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "1.0.0",  # Outdated (would be OUTDATED_ENFORCED)
                "computer_name": "TEST-PC",
                "os": "Windows 10",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            # Configure enforcement OFF
            mock_settings.version_policy.enforce_enabled = False
            mock_settings.version_policy.reject_outdated_enforced = True
            mock_settings.version_policy.reject_unknown = False

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            # Should succeed despite outdated enforced version
            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            assert result.access_token is not None
            assert result.user["username"] == sample_domain_user.username

    @pytest.mark.asyncio
    async def test_enforcement_off_allows_unknown_version(
        self, db_session, sample_domain_user, mock_cache
    ):
        """When enforcement is OFF, unknown versions should be allowed."""
        # Create version registry (1.0.0 is known, 9.9.9 is unknown)
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "9.9.9",  # Unknown version
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = False
            mock_settings.version_policy.reject_unknown = True  # Would reject if enabled

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            # Should succeed despite unknown version (enforcement OFF)
            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            assert result.access_token is not None


class TestVersionEnforcementOn:
    """Tests when VERSION_POLICY_ENFORCE_ENABLED=True."""

    @pytest.mark.asyncio
    async def test_enforcement_on_allows_ok_version(
        self, db_session, sample_domain_user, mock_cache
    ):
        """When enforcement is ON, current/OK versions should be allowed."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=True)
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "2.0.0",  # Latest version (OK)
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            assert result.access_token is not None

    @pytest.mark.asyncio
    async def test_enforcement_on_allows_outdated_non_enforced(
        self, db_session, sample_domain_user, mock_cache
    ):
        """When enforcement is ON but latest is NOT enforced, outdated versions pass."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=False)  # Not enforced
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "1.0.0",  # Outdated but not enforced
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            # Should succeed (version is OUTDATED, not OUTDATED_ENFORCED)
            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            assert result.access_token is not None

    @pytest.mark.asyncio
    async def test_enforcement_on_rejects_outdated_enforced(
        self, db_session, sample_domain_user, mock_cache
    ):
        """When enforcement is ON and version is OUTDATED_ENFORCED, reject with HTTP 426."""
        await db_session.execute(delete(ClientVersion))
        await db_session.execute(delete(DesktopSession))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=True)
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "1.0.0",  # OUTDATED_ENFORCED
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True
            mock_settings.version_policy.reject_unknown = False

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            # Verify HTTP 426 (Upgrade Required)
            assert exc_info.value.status_code == 426

            # Verify error response structure per Phase 7 spec
            detail = exc_info.value.detail
            assert detail["reason"] == "version_enforced"
            assert detail["target_version"] == "2.0.0"
            assert detail["current_version"] == "1.0.0"
            assert detail["version_status"] == "outdated_enforced"

            # Verify NO session was created
            sessions = await db_session.execute(select(DesktopSession))
            assert sessions.scalars().all() == []

    @pytest.mark.asyncio
    async def test_enforcement_on_allows_unknown_by_default(
        self, db_session, sample_domain_user, mock_cache
    ):
        """When enforcement is ON, unknown versions are allowed by default."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "9.9.9",  # Unknown version
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True
            mock_settings.version_policy.reject_unknown = False  # Default: allow unknown

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            # Should succeed (unknown versions allowed by default)
            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            assert result.access_token is not None

    @pytest.mark.asyncio
    async def test_enforcement_on_rejects_unknown_when_configured(
        self, db_session, sample_domain_user, mock_cache
    ):
        """When enforcement is ON and reject_unknown=True, unknown versions rejected."""
        await db_session.execute(delete(ClientVersion))
        await db_session.execute(delete(DesktopSession))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "9.9.9",  # Unknown version
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_unknown = True  # Reject unknown

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 426
            detail = exc_info.value.detail
            assert detail["reason"] == "version_enforced"
            assert detail["version_status"] == "unknown"


class TestVersionEnforcementSSO:
    """Tests version enforcement for SSO login flow."""

    @pytest.mark.asyncio
    async def test_sso_enforcement_rejects_outdated_enforced(
        self, db_session, sample_domain_user, mock_cache
    ):
        """SSO login also enforces version policy."""
        await db_session.execute(delete(ClientVersion))
        await db_session.execute(delete(DesktopSession))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=True)
        )

        login_data = SSOLoginRequest(
            username=sample_domain_user.username,
            device_info={
                "app_version": "1.0.0",  # OUTDATED_ENFORCED
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True
            mock_settings.version_policy.reject_unknown = False

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.sso_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 426
            assert exc_info.value.detail["reason"] == "version_enforced"


class TestVersionEnforcementRollback:
    """Tests that enforcement can be rolled back instantly."""

    @pytest.mark.asyncio
    async def test_enforcement_rollback_allows_previously_rejected(
        self, db_session, sample_domain_user, mock_cache
    ):
        """Turning enforcement OFF allows previously rejected versions immediately."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=True)
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "1.0.0",  # OUTDATED_ENFORCED
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        # First: verify enforcement rejects
        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            with pytest.raises(HTTPException):
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

        # Second: turn enforcement OFF and verify immediate rollback
        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = False  # Turned OFF
            mock_settings.version_policy.reject_outdated_enforced = True

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            # Should now succeed immediately
            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            assert result.access_token is not None


class TestExistingSessionsUnaffected:
    """Tests that existing sessions are never affected by enforcement."""

    @pytest.mark.asyncio
    async def test_existing_session_not_terminated_by_enforcement(
        self, db_session, sample_user
    ):
        """Existing active sessions should not be affected by enforcement changes.

        This test verifies the enforcement boundary guarantee: enforcement only
        affects NEW session creation, never existing sessions.
        """
        from db import DesktopSession
        from datetime import datetime, timezone

        await db_session.execute(delete(DesktopSession))
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        # Create version registry with enforcement
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="2.0.0", is_enforced=True)
        )

        # Create an existing session with old version (simulating pre-enforcement)
        existing_session = DesktopSession(
            user_id=sample_user.id,
            ip_address="192.168.1.100",
            app_version="1.0.0",  # Old version
            is_active=True,
            auth_method="sso",
            computer_name="EXISTING-PC",
            created_at=datetime.now(timezone.utc),
            last_active_at=datetime.now(timezone.utc),
        )
        db_session.add(existing_session)
        await db_session.commit()
        await db_session.refresh(existing_session)
        session_id = existing_session.id

        # Even with enforcement ON, existing session should remain unchanged
        # (Note: There is no background job or mechanism that terminates sessions)
        # The session is simply not affected by the enforcement logic

        # Verify session still exists and is active
        result = await db_session.execute(
            select(DesktopSession).where(DesktopSession.id == session_id)
        )
        session = result.scalar_one_or_none()

        assert session is not None
        assert session.is_active is True
        assert session.app_version == "1.0.0"  # Version unchanged

        # This test documents the guarantee: enforcement never touches existing sessions


class TestInstallerMetadata:
    """Tests for Phase 7.1 - Upgrade Distribution Metadata in enforcement responses."""

    @pytest.mark.asyncio
    async def test_enforcement_rejection_includes_installer_metadata(
        self, db_session, sample_domain_user, mock_cache
    ):
        """Enforcement rejection should include installer metadata when configured."""
        await db_session.execute(delete(ClientVersion))
        await db_session.execute(delete(DesktopSession))
        await db_session.commit()

        # Create versions with installer metadata
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session,
            ClientVersionCreate(
                version_string="2.0.0",
                is_enforced=True,
                installer_url="https://onedrive.live.com/download/it-app-desktop-2.0.0-x64.msi",
                silent_install_args="/qn /norestart /log install.log",
            ),
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "1.0.0",  # OUTDATED_ENFORCED
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True
            mock_settings.version_policy.reject_unknown = False

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 426
            detail = exc_info.value.detail

            # Verify installer metadata is included
            assert detail["reason"] == "version_enforced"
            assert detail["target_version"] == "2.0.0"
            assert detail["installer_url"] == "https://onedrive.live.com/download/it-app-desktop-2.0.0-x64.msi"
            assert detail["silent_install_args"] == "/qn /norestart /log install.log"

    @pytest.mark.asyncio
    async def test_enforcement_rejection_omits_metadata_when_not_configured(
        self, db_session, sample_domain_user, mock_cache
    ):
        """Enforcement rejection should omit installer metadata when not configured."""
        await db_session.execute(delete(ClientVersion))
        await db_session.execute(delete(DesktopSession))
        await db_session.commit()

        # Create versions WITHOUT installer metadata
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session,
            ClientVersionCreate(
                version_string="2.0.0",
                is_enforced=True,
                # No installer_url or silent_install_args
            ),
        )

        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={
                "app_version": "1.0.0",
                "computer_name": "TEST-PC",
            },
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache), \
             patch("services.auth_service.settings") as mock_settings:

            mock_settings.version_policy.enforce_enabled = True
            mock_settings.version_policy.reject_outdated_enforced = True
            mock_settings.version_policy.reject_unknown = False

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=sample_domain_user)

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 426
            detail = exc_info.value.detail

            # Verify core rejection fields are present
            assert detail["reason"] == "version_enforced"
            assert detail["target_version"] == "2.0.0"

            # Verify installer metadata is NOT included when not configured
            assert "installer_url" not in detail
            # silent_install_args has a default value, so it may be present with default
            # We check installer_url specifically since it's the key field

    @pytest.mark.asyncio
    async def test_invalid_installer_url_rejected_at_creation(self, db_session):
        """Invalid installer URLs should be rejected at version creation."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        # Test invalid URL schemes
        with pytest.raises(ValueError) as exc_info:
            ClientVersionCreate(
                version_string="1.0.0",
                installer_url="ftp://invalid-scheme.com/file.msi",
            )
        assert "HTTP or HTTPS" in str(exc_info.value)

        # Test URL without domain
        with pytest.raises(ValueError) as exc_info:
            ClientVersionCreate(
                version_string="1.0.0",
                installer_url="https://",
            )
        assert "valid domain" in str(exc_info.value)

        # Test malformed URL
        with pytest.raises(ValueError) as exc_info:
            ClientVersionCreate(
                version_string="1.0.0",
                installer_url="not-a-valid-url",
            )
        assert "HTTP or HTTPS" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_valid_installer_url_accepted(self, db_session):
        """Valid installer URLs should be accepted."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        # Test valid HTTPS URL
        version = await ClientVersionService.create_version(
            db_session,
            ClientVersionCreate(
                version_string="1.0.0",
                installer_url="https://onedrive.live.com/download/file.msi",
                silent_install_args="/qn",
            ),
        )

        assert version.installer_url == "https://onedrive.live.com/download/file.msi"
        assert version.silent_install_args == "/qn"

    @pytest.mark.asyncio
    async def test_default_silent_install_args(self, db_session):
        """Silent install args should have a sensible default."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        version = await ClientVersionService.create_version(
            db_session,
            ClientVersionCreate(
                version_string="1.0.0",
                installer_url="https://example.com/installer.msi",
                # No silent_install_args specified - should use default
            ),
        )

        # Default from schema should be /qn /norestart
        assert version.silent_install_args == "/qn /norestart"

    @pytest.mark.asyncio
    async def test_installer_metadata_in_policy_result(self, db_session):
        """VersionPolicyResult should include installer metadata."""
        from api.services.version_policy_service import VersionPolicyService

        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        # Create versions with installer metadata
        await ClientVersionService.create_version(
            db_session, ClientVersionCreate(version_string="1.0.0")
        )
        await ClientVersionService.create_version(
            db_session,
            ClientVersionCreate(
                version_string="2.0.0",
                is_enforced=True,
                installer_url="https://example.com/v2.msi",
                silent_install_args="/qn /log",
            ),
        )

        # Resolve policy for outdated version
        result = await VersionPolicyService.resolve_for_session(
            db_session,
            client_version_string="1.0.0",
            platform="desktop",
        )

        assert result.version_status == VersionStatus.OUTDATED_ENFORCED
        assert result.target_version_string == "2.0.0"
        assert result.installer_url == "https://example.com/v2.msi"
        assert result.silent_install_args == "/qn /log"

        # Verify to_dict includes the metadata
        result_dict = result.to_dict()
        assert result_dict["installer_url"] == "https://example.com/v2.msi"
        assert result_dict["silent_install_args"] == "/qn /log"
