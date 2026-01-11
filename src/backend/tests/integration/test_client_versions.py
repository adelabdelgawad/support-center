"""
Integration tests for Client Version Service.

Tests cover:
- Create version (valid higher version → success)
- Create version (lower or equal version → rejected)
- Auto-unset previous latest when new version is added
- Enforcement flags preserved correctly
- Version list reflects correct latest version

These tests run against a real test database.
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from models import ClientVersion
from schemas.version import ClientVersionCreate, ClientVersionUpdate
from services.client_version_service import ClientVersionService


class TestClientVersionCreate:
    """Tests for version creation."""

    @pytest_asyncio.fixture
    async def clean_versions(self, db_session: AsyncSession):
        """Clean up any existing versions before test."""
        from sqlalchemy import delete
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()
        yield

    @pytest.mark.asyncio
    async def test_create_first_version_is_always_latest(
        self, db_session: AsyncSession, clean_versions
    ):
        """First version created should always be marked as latest."""
        version_data = ClientVersionCreate(
            version_string="1.0.0",
            is_enforced=False,
        )

        result = await ClientVersionService.create_version(db_session, version_data)

        assert result is not None
        assert result.version_string == "1.0.0"
        assert result.is_latest is True
        assert result.platform == "desktop"
        assert result.order_index > 0

    @pytest.mark.asyncio
    async def test_create_higher_version_becomes_latest(
        self, db_session: AsyncSession, clean_versions
    ):
        """Creating a higher version should make it the new latest."""
        # Create first version
        v1_data = ClientVersionCreate(version_string="1.0.0")
        v1 = await ClientVersionService.create_version(db_session, v1_data)
        assert v1.is_latest is True

        # Create higher version
        v2_data = ClientVersionCreate(version_string="2.0.0")
        v2 = await ClientVersionService.create_version(db_session, v2_data)

        # Refresh v1 to get updated state
        await db_session.refresh(v1)

        assert v2.is_latest is True
        assert v1.is_latest is False  # Previous latest should be unset

    @pytest.mark.asyncio
    async def test_create_lower_version_rejected(
        self, db_session: AsyncSession, clean_versions
    ):
        """Creating a version lower than current latest should be rejected."""
        # Create first version
        v1_data = ClientVersionCreate(version_string="2.0.0")
        await ClientVersionService.create_version(db_session, v1_data)

        # Try to create lower version
        v2_data = ClientVersionCreate(version_string="1.0.0")

        with pytest.raises(ValueError) as exc_info:
            await ClientVersionService.create_version(db_session, v2_data)

        assert "must be greater than" in str(exc_info.value)
        assert "2.0.0" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_equal_version_rejected(
        self, db_session: AsyncSession, clean_versions
    ):
        """Creating a version equal to current latest should be rejected."""
        # Create first version
        v1_data = ClientVersionCreate(version_string="1.5.0")
        await ClientVersionService.create_version(db_session, v1_data)

        # Try to create same version again
        v2_data = ClientVersionCreate(version_string="1.5.0")

        with pytest.raises(ValueError) as exc_info:
            await ClientVersionService.create_version(db_session, v2_data)

        # Should get "already exists" error (checked before version comparison)
        assert "already exists" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_invalid_version_format_rejected(
        self, db_session: AsyncSession, clean_versions
    ):
        """Creating a version with invalid format should be rejected."""
        invalid_versions = [
            "not-a-version",
            "1.2",  # Missing patch
            "v1",   # Incomplete
            "1.2.3.4",  # Too many parts
        ]

        for invalid_version in invalid_versions:
            with pytest.raises(ValueError) as exc_info:
                version_data = ClientVersionCreate(version_string=invalid_version)
                await ClientVersionService.create_version(db_session, version_data)

            assert "Invalid version format" in str(exc_info.value), \
                f"Expected 'Invalid version format' for '{invalid_version}', got: {exc_info.value}"

    @pytest.mark.asyncio
    async def test_create_version_with_enforcement(
        self, db_session: AsyncSession, clean_versions
    ):
        """Version can be created with enforcement enabled."""
        version_data = ClientVersionCreate(
            version_string="1.0.0",
            is_enforced=True,
        )

        result = await ClientVersionService.create_version(db_session, version_data)

        assert result.is_enforced is True

    @pytest.mark.asyncio
    async def test_create_prerelease_version(
        self, db_session: AsyncSession, clean_versions
    ):
        """Pre-release versions should be accepted."""
        version_data = ClientVersionCreate(version_string="1.0.0-beta.1")

        result = await ClientVersionService.create_version(db_session, version_data)

        assert result.version_string == "1.0.0-beta.1"
        assert result.is_latest is True

    @pytest.mark.asyncio
    async def test_release_after_prerelease(
        self, db_session: AsyncSession, clean_versions
    ):
        """Release version should be greater than its pre-release."""
        # Create pre-release
        pre_data = ClientVersionCreate(version_string="1.0.0-beta")
        pre = await ClientVersionService.create_version(db_session, pre_data)
        assert pre.is_latest is True

        # Create release (should succeed - release > pre-release)
        rel_data = ClientVersionCreate(version_string="1.0.0")
        rel = await ClientVersionService.create_version(db_session, rel_data)

        await db_session.refresh(pre)

        assert rel.is_latest is True
        assert pre.is_latest is False


class TestClientVersionList:
    """Tests for version listing."""

    @pytest_asyncio.fixture
    async def sample_versions(self, db_session: AsyncSession):
        """Create sample versions for testing."""
        from sqlalchemy import delete
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        versions = []
        version_strings = ["1.0.0", "1.1.0", "1.2.0", "2.0.0"]

        for vs in version_strings:
            v = await ClientVersionService.create_version(
                db_session,
                ClientVersionCreate(version_string=vs)
            )
            versions.append(v)

        return versions

    @pytest.mark.asyncio
    async def test_list_versions_ordered_by_order_index(
        self, db_session: AsyncSession, sample_versions
    ):
        """Versions should be ordered by order_index descending."""
        versions = await ClientVersionService.list_versions(db_session)

        # Should be in descending order (newest first)
        assert len(versions) == 4
        assert versions[0].version_string == "2.0.0"
        assert versions[-1].version_string == "1.0.0"

    @pytest.mark.asyncio
    async def test_list_versions_only_one_latest(
        self, db_session: AsyncSession, sample_versions
    ):
        """Only one version should be marked as latest."""
        versions = await ClientVersionService.list_versions(db_session)

        latest_count = sum(1 for v in versions if v.is_latest)
        assert latest_count == 1

        # The highest version should be latest
        latest = next(v for v in versions if v.is_latest)
        assert latest.version_string == "2.0.0"


class TestClientVersionUpdate:
    """Tests for version updates."""

    @pytest_asyncio.fixture
    async def sample_version(self, db_session: AsyncSession):
        """Create a sample version for testing."""
        from sqlalchemy import delete
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        return await ClientVersionService.create_version(
            db_session,
            ClientVersionCreate(version_string="1.0.0")
        )

    @pytest.mark.asyncio
    async def test_update_enforcement(
        self, db_session: AsyncSession, sample_version
    ):
        """Should be able to toggle enforcement flag."""
        # Enable enforcement
        result = await ClientVersionService.update_version(
            db_session,
            sample_version.id,
            ClientVersionUpdate(is_enforced=True)
        )

        assert result.is_enforced is True

        # Disable enforcement
        result = await ClientVersionService.update_version(
            db_session,
            sample_version.id,
            ClientVersionUpdate(is_enforced=False)
        )

        assert result.is_enforced is False

    @pytest.mark.asyncio
    async def test_update_release_notes(
        self, db_session: AsyncSession, sample_version
    ):
        """Should be able to update release notes."""
        result = await ClientVersionService.update_version(
            db_session,
            sample_version.id,
            ClientVersionUpdate(release_notes="Bug fixes and improvements")
        )

        assert result.release_notes == "Bug fixes and improvements"

    @pytest.mark.asyncio
    async def test_update_is_active(
        self, db_session: AsyncSession, sample_version
    ):
        """Should be able to deactivate a version."""
        result = await ClientVersionService.update_version(
            db_session,
            sample_version.id,
            ClientVersionUpdate(is_active=False)
        )

        assert result.is_active is False


class TestClientVersionDelete:
    """Tests for version deletion."""

    @pytest_asyncio.fixture
    async def sample_version(self, db_session: AsyncSession):
        """Create a sample version for testing."""
        from sqlalchemy import delete
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        return await ClientVersionService.create_version(
            db_session,
            ClientVersionCreate(version_string="1.0.0", is_enforced=True)
        )

    @pytest.mark.asyncio
    async def test_soft_delete_deactivates_version(
        self, db_session: AsyncSession, sample_version
    ):
        """Soft delete should set is_active=False."""
        result = await ClientVersionService.delete_version(
            db_session,
            sample_version.id,
            hard_delete=False
        )

        assert result is True

        # Fetch and verify
        version = await ClientVersionService.get_version(db_session, sample_version.id)
        assert version.is_active is False
        assert version.is_latest is False
        assert version.is_enforced is False

    @pytest.mark.asyncio
    async def test_hard_delete_removes_version(
        self, db_session: AsyncSession, sample_version
    ):
        """Hard delete should remove the version entirely."""
        result = await ClientVersionService.delete_version(
            db_session,
            sample_version.id,
            hard_delete=True
        )

        assert result is True

        # Fetch and verify - should be None
        version = await ClientVersionService.get_version(db_session, sample_version.id)
        assert version is None


class TestGetLatestVersion:
    """Tests for get_latest_version."""

    @pytest_asyncio.fixture
    async def multiple_versions(self, db_session: AsyncSession):
        """Create multiple versions for testing."""
        from sqlalchemy import delete
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        versions = []
        for vs in ["1.0.0", "1.1.0", "2.0.0"]:
            v = await ClientVersionService.create_version(
                db_session,
                ClientVersionCreate(version_string=vs)
            )
            versions.append(v)

        return versions

    @pytest.mark.asyncio
    async def test_get_latest_returns_highest_version(
        self, db_session: AsyncSession, multiple_versions
    ):
        """get_latest_version should return the version marked as latest."""
        latest = await ClientVersionService.get_latest_version(db_session, "desktop")

        assert latest is not None
        assert latest.version_string == "2.0.0"
        assert latest.is_latest is True

    @pytest.mark.asyncio
    async def test_get_latest_returns_none_when_empty(
        self, db_session: AsyncSession
    ):
        """get_latest_version should return None when no versions exist."""
        from sqlalchemy import delete
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        latest = await ClientVersionService.get_latest_version(db_session, "desktop")

        assert latest is None
