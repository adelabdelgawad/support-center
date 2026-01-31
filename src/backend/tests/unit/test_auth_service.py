"""
Unit tests for authentication service.

Tests:
- User creation from AD data
- User update from AD data
- AD login flow
- SSO login flow
- Duplicate user handling (race conditions)
- Case-insensitive username matching
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from db.models import User
from api.schemas.login import ADLoginRequest, SSOLoginRequest
from api.services.auth_service import AuthenticationService


class TestUserCreationFromAD:
    """Tests for creating users from Active Directory data."""

    @pytest.mark.asyncio
    async def test_create_user_from_ad_success(
        self, db_session, sample_domain_user
    ):
        """Test successful user creation from AD data."""
        auth_service = AuthenticationService()

        user = await auth_service._create_user_from_ad(sample_domain_user, db_session)

        assert user is not None
        assert user.username == sample_domain_user.username
        assert user.email == sample_domain_user.email
        assert user.full_name == sample_domain_user.full_name
        assert user.phone_number == sample_domain_user.phone_number
        assert user.is_domain is True
        assert user.is_active is True
        assert user.password_hash is None

    @pytest.mark.asyncio
    async def test_create_user_from_ad_with_manager(
        self, db_session, sample_domain_user, sample_user
    ):
        """Test user creation with manager reference."""
        # Set manager username to existing user
        sample_domain_user.manager_username = sample_user.username

        auth_service = AuthenticationService()
        user = await auth_service._create_user_from_ad(sample_domain_user, db_session)

        assert user.manager_id == sample_user.id

    @pytest.mark.asyncio
    async def test_create_user_from_ad_without_manager(
        self, db_session, sample_domain_user
    ):
        """Test user creation without manager (manager not found in DB)."""
        sample_domain_user.manager_username = "nonexistent.manager"

        auth_service = AuthenticationService()
        user = await auth_service._create_user_from_ad(sample_domain_user, db_session)

        assert user.manager_id is None


class TestUserUpdateFromAD:
    """Tests for updating existing users with AD data."""

    @pytest.mark.asyncio
    async def test_update_user_from_ad_success(
        self, db_session, sample_user, sample_domain_user
    ):
        """Test successful user update from AD data."""
        # Setup: user exists with different data
        sample_user.email = "old.email@example.com"
        sample_user.phone_number = "0000000000"
        await db_session.commit()

        # Update domain user to match sample_user username
        sample_domain_user.username = sample_user.username
        sample_domain_user.email = "new.email@example.com"
        sample_domain_user.phone_number = "1111111111"

        auth_service = AuthenticationService()
        updated_user = await auth_service._update_user_from_ad(
            sample_user, sample_domain_user, db_session
        )

        assert updated_user.email == "new.email@example.com"
        assert updated_user.phone_number == "1111111111"
        assert updated_user.is_domain is True

    @pytest.mark.asyncio
    async def test_update_user_preserves_existing_data_when_ad_data_missing(
        self, db_session, sample_user, sample_domain_user
    ):
        """Test that existing data is preserved when AD data is None."""
        # Setup: user has existing data
        sample_user.email = "existing@example.com"
        sample_user.phone_number = "9999999999"
        await db_session.commit()

        # Domain user has None values
        sample_domain_user.username = sample_user.username
        sample_domain_user.email = None
        sample_domain_user.phone_number = None

        auth_service = AuthenticationService()
        updated_user = await auth_service._update_user_from_ad(
            sample_user, sample_domain_user, db_session
        )

        # Original values should be preserved
        assert updated_user.email == "existing@example.com"
        assert updated_user.phone_number == "9999999999"


class TestADLoginFlow:
    """Tests for Active Directory login flow."""

    @pytest.mark.asyncio
    async def test_ad_login_new_user_success(
        self, db_session, session_type, sample_domain_user, mock_cache
    ):
        """Test successful AD login for a new user."""
        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={"os": "Linux", "browser": "Chrome"},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache):

            # Mock LDAP authentication
            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(
                return_value=sample_domain_user
            )

            # Execute login
            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            # Verify response
            assert result.access_token is not None
            assert result.token_type == "bearer"
            assert result.user["username"] == sample_domain_user.username
            assert result.user["email"] == sample_domain_user.email

            # Verify user was created in database
            user_result = await db_session.execute(
                select(User).where(User.username == sample_domain_user.username)
            )
            created_user = user_result.scalar_one_or_none()
            assert created_user is not None
            assert created_user.is_domain is True

    @pytest.mark.asyncio
    async def test_ad_login_existing_user_updates_data(
        self, db_session, session_type, sample_ad_user, sample_domain_user, mock_cache
    ):
        """Test AD login for existing user updates their information."""
        # Setup: existing user with old data
        sample_ad_user.email = "old.email@example.com"
        sample_ad_user.phone_number = "0000000000"
        await db_session.commit()

        # Domain user has new data
        sample_domain_user.username = sample_ad_user.username
        sample_domain_user.email = "new.email@example.com"
        sample_domain_user.phone_number = "1111111111"

        login_data = ADLoginRequest(
            username=sample_ad_user.username,
            password="test_password",
            device_info={"os": "Linux"},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache):

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(
                return_value=sample_domain_user
            )
            mock_cache.refresh_user_permissions = AsyncMock(return_value={})

            await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            # Verify user data was updated
            await db_session.refresh(sample_ad_user)
            assert sample_ad_user.email == "new.email@example.com"
            assert sample_ad_user.phone_number == "1111111111"

    @pytest.mark.asyncio
    async def test_ad_login_case_insensitive_username(
        self, db_session, session_type, sample_ad_user, sample_domain_user, mock_cache
    ):
        """Test that username matching is case-insensitive."""
        # Existing user: "ad.user"
        # Login with: "AD.USER"

        sample_domain_user.username = sample_ad_user.username

        login_data = ADLoginRequest(
            username=sample_ad_user.username.upper(),  # Different case
            password="test_password",
            device_info={},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache):

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(
                return_value=sample_domain_user
            )
            mock_cache.refresh_user_permissions = AsyncMock(return_value={})

            result = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            # Should find existing user despite case difference
            assert result.user["username"] == sample_ad_user.username

    @pytest.mark.asyncio
    async def test_ad_login_handles_duplicate_key_error(
        self, db_session, session_type, sample_domain_user, mock_cache
    ):
        """Test handling of duplicate key error (race condition)."""
        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="test_password",
            device_info={},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache):

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(
                return_value=sample_domain_user
            )
            mock_cache.refresh_user_permissions = AsyncMock(return_value={})

            # First login creates user
            result1 = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )
            assert result1.access_token is not None

            # Second login should update user, not fail
            result2 = await auth_service.ad_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )
            assert result2.access_token is not None

    @pytest.mark.asyncio
    async def test_ad_login_invalid_credentials(
        self, db_session, session_type, sample_domain_user
    ):
        """Test AD login with invalid credentials."""
        login_data = ADLoginRequest(
            username=sample_domain_user.username,
            password="wrong_password",
            device_info={},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap:
            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=False)

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 401
            assert "Invalid username or password" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_ad_login_inactive_user(
        self, db_session, session_type, sample_ad_user, sample_domain_user, mock_cache
    ):
        """Test AD login for inactive user."""
        # Deactivate user
        sample_ad_user.is_active = False
        await db_session.commit()

        sample_domain_user.username = sample_ad_user.username

        login_data = ADLoginRequest(
            username=sample_ad_user.username,
            password="test_password",
            device_info={},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache):

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(
                return_value=sample_domain_user
            )

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 403
            assert "inactive" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_ad_login_blocked_user(
        self, db_session, session_type, sample_ad_user, sample_domain_user, mock_cache
    ):
        """Test AD login for blocked user."""
        # Block user
        sample_ad_user.is_blocked = True
        sample_ad_user.block_message = "Test block"
        await db_session.commit()

        sample_domain_user.username = sample_ad_user.username

        login_data = ADLoginRequest(
            username=sample_ad_user.username,
            password="test_password",
            device_info={},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache):

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.authenticate_user = AsyncMock(return_value=True)
            mock_ldap_instance.get_user_by_username = AsyncMock(
                return_value=sample_domain_user
            )

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.ad_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 403
            assert "blocked" in exc_info.value.detail.lower()


class TestSSOLoginFlow:
    """Tests for SSO (username-only) login flow."""

    @pytest.mark.asyncio
    async def test_sso_login_new_user_from_ad(
        self, db_session, session_type, sample_domain_user, mock_cache
    ):
        """Test SSO login creates user from AD if not in database."""
        login_data = SSOLoginRequest(
            username=sample_domain_user.username,
            device_info={"os": "Linux"},
        )

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap, \
             patch("core.cache.cache", mock_cache):

            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.get_user_by_username = AsyncMock(
                return_value=sample_domain_user
            )

            result = await auth_service.sso_login(
                login_data=login_data, db=db_session, client_ip="127.0.0.1"
            )

            assert result.access_token is not None
            assert result.user["username"] == sample_domain_user.username

            # Verify user was created
            user_result = await db_session.execute(
                select(User).where(User.username == sample_domain_user.username)
            )
            created_user = user_result.scalar_one_or_none()
            assert created_user is not None

    @pytest.mark.asyncio
    async def test_sso_login_user_not_found_in_db_or_ad(
        self, db_session, session_type
    ):
        """Test SSO login fails if user not in DB or AD."""
        login_data = SSOLoginRequest(username="nonexistent.user", device_info={})

        auth_service = AuthenticationService()

        with patch("services.auth_service.LdapService") as MockLdap:
            mock_ldap_instance = MockLdap.return_value
            mock_ldap_instance.get_user_by_username = AsyncMock(return_value=None)

            with pytest.raises(HTTPException) as exc_info:
                await auth_service.sso_login(
                    login_data=login_data, db=db_session, client_ip="127.0.0.1"
                )

            assert exc_info.value.status_code == 404
            assert "not found" in exc_info.value.detail.lower()
