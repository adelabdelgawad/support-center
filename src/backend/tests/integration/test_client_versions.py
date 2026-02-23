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
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import ClientVersion
from api.schemas.version import ClientVersionCreate, ClientVersionUpdate
from api.services.setting.client_version_service import ClientVersionService


class TestClientVersionCreate:
    """Tests for version creation."""

    @pytest_asyncio.fixture
    async def clean_versions(self, db_session: AsyncSession):
        """Clean up any existing versions before test."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()
        yield

    @pytest.mark.asyncio
    async def test_create_first_version_is_always_latest(
        self, db_session: AsyncSession, clean_versions
    ):
        """First version created should always be marked as latest."""
        service = ClientVersionService(db_session)
        version_data = ClientVersionCreate(
            version_string="1.0.0",
            is_enforced=False,
        )

        result = await service.create_version(version_data)

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
        service = ClientVersionService(db_session)
        # Create first version
        v1_data = ClientVersionCreate(version_string="1.0.0")
        v1 = await service.create_version(v1_data)
        assert v1.is_latest is True

        # Create higher version
        v2_data = ClientVersionCreate(version_string="2.0.0")
        v2 = await service.create_version(v2_data)

        assert v2.is_latest is True
        assert v1.is_latest is False  # Previous latest should be unset

    @pytest.mark.asyncio
    async def test_create_lower_version_rejected(
        self, db_session: AsyncSession, clean_versions
    ):
        """Creating a version lower than current latest should be rejected."""
        service = ClientVersionService(db_session)
        # Create first version
        v1_data = ClientVersionCreate(version_string="2.0.0")
        await service.create_version(v1_data)

        # Try to create lower version
        v2_data = ClientVersionCreate(version_string="1.0.0")

        with pytest.raises((ValueError, Exception)):
            await service.create_version(v2_data)

    @pytest.mark.asyncio
    async def test_create_equal_version_rejected(
        self, db_session: AsyncSession, clean_versions
    ):
        """Creating a version equal to current latest should be rejected."""
        service = ClientVersionService(db_session)
        # Create first version
        v1_data = ClientVersionCreate(version_string="1.5.0")
        await service.create_version(v1_data)

        # Try to create same version again
        v2_data = ClientVersionCreate(version_string="1.5.0")

        with pytest.raises((ValueError, Exception)):
            await service.create_version(v2_data)

    @pytest.mark.asyncio
    async def test_create_version_with_enforcement(
        self, db_session: AsyncSession, clean_versions
    ):
        """Version can be created with enforcement enabled."""
        service = ClientVersionService(db_session)
        version_data = ClientVersionCreate(
            version_string="1.0.0",
            is_enforced=True,
        )

        result = await service.create_version(version_data)

        assert result.is_enforced is True

    @pytest.mark.asyncio
    async def test_create_prerelease_version(
        self, db_session: AsyncSession, clean_versions
    ):
        """Pre-release versions should be accepted."""
        service = ClientVersionService(db_session)
        version_data = ClientVersionCreate(version_string="1.0.0-beta.1")

        result = await service.create_version(version_data)

        assert result.version_string == "1.0.0-beta.1"
        assert result.is_latest is True

    @pytest.mark.asyncio
    async def test_release_after_prerelease(
        self, db_session: AsyncSession, clean_versions
    ):
        """Release version should be greater than its pre-release."""
        service = ClientVersionService(db_session)
        # Create pre-release
        pre_data = ClientVersionCreate(version_string="1.0.0-beta")
        pre = await service.create_version(pre_data)
        assert pre.is_latest is True

        # Create release (should succeed - release > pre-release)
        rel_data = ClientVersionCreate(version_string="1.0.0")
        rel = await service.create_version(rel_data)

        assert rel.is_latest is True
        assert pre.is_latest is False


class TestClientVersionList:
    """Tests for version listing."""

    @pytest_asyncio.fixture
    async def sample_versions(self, db_session: AsyncSession):
        """Create sample versions for testing."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        service = ClientVersionService(db_session)
        versions = []
        version_strings = ["1.0.0", "1.1.0", "1.2.0", "2.0.0"]

        for vs in version_strings:
            v = await service.create_version(
                ClientVersionCreate(version_string=vs)
            )
            versions.append(v)

        return versions

    @pytest.mark.asyncio
    async def test_list_versions_ordered_by_order_index(
        self, db_session: AsyncSession, sample_versions
    ):
        """Versions should be ordered by order_index descending."""
        service = ClientVersionService(db_session)
        versions = await service.get_versions()

        # Should be in descending order (newest first)
        assert len(versions) == 4
        assert versions[0].version_string == "2.0.0"
        assert versions[-1].version_string == "1.0.0"

    @pytest.mark.asyncio
    async def test_list_versions_only_one_latest(
        self, db_session: AsyncSession, sample_versions
    ):
        """Only one version should be marked as latest."""
        service = ClientVersionService(db_session)
        versions = await service.get_versions()

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
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        service = ClientVersionService(db_session)
        return await service.create_version(
            ClientVersionCreate(version_string="1.0.0")
        )

    @pytest.mark.asyncio
    async def test_update_enforcement(
        self, db_session: AsyncSession, sample_version
    ):
        """Should be able to toggle enforcement flag."""
        service = ClientVersionService(db_session)
        # Enable enforcement
        result = await service.update_version(
            sample_version.id,
            ClientVersionUpdate(is_enforced=True)
        )

        assert result.is_enforced is True

        # Disable enforcement
        result = await service.update_version(
            sample_version.id,
            ClientVersionUpdate(is_enforced=False)
        )

        assert result.is_enforced is False

    @pytest.mark.asyncio
    async def test_update_release_notes(
        self, db_session: AsyncSession, sample_version
    ):
        """Should be able to update release notes."""
        service = ClientVersionService(db_session)
        result = await service.update_version(
            sample_version.id,
            ClientVersionUpdate(release_notes="Bug fixes and improvements")
        )

        assert result.release_notes == "Bug fixes and improvements"

    @pytest.mark.asyncio
    async def test_update_is_active(
        self, db_session: AsyncSession, sample_version
    ):
        """Should be able to deactivate a version."""
        service = ClientVersionService(db_session)
        result = await service.update_version(
            sample_version.id,
            ClientVersionUpdate(is_active=False)
        )

        assert result.is_active is False


class TestGetLatestVersion:
    """Tests for get_latest_version."""

    @pytest_asyncio.fixture
    async def multiple_versions(self, db_session: AsyncSession):
        """Create multiple versions for testing."""
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        service = ClientVersionService(db_session)
        versions = []
        for vs in ["1.0.0", "1.1.0", "2.0.0"]:
            v = await service.create_version(
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
        await db_session.execute(delete(ClientVersion))
        await db_session.commit()

        latest = await ClientVersionService.get_latest_version(db_session, "desktop")

        assert latest is None
