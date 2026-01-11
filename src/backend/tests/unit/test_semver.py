"""
Unit tests for semantic version comparison module.

Tests cover:
- Valid version parsing
- Invalid version rejection
- Version comparison (less than, greater than, equal)
- Pre-release version ordering
- Order index computation
"""

import pytest
from core.semver import (
    SemanticVersion,
    InvalidVersionError,
    compare_versions,
    is_valid_version,
    version_greater_than,
)


class TestSemanticVersionParsing:
    """Tests for SemanticVersion.parse() method."""

    def test_parse_simple_version(self):
        """Parse a simple major.minor.patch version."""
        v = SemanticVersion.parse("1.2.3")
        assert v.major == 1
        assert v.minor == 2
        assert v.patch == 3
        assert v.prerelease is None

    def test_parse_zero_version(self):
        """Parse version with zeros."""
        v = SemanticVersion.parse("0.0.1")
        assert v.major == 0
        assert v.minor == 0
        assert v.patch == 1

    def test_parse_large_numbers(self):
        """Parse version with large numbers."""
        v = SemanticVersion.parse("100.200.300")
        assert v.major == 100
        assert v.minor == 200
        assert v.patch == 300

    def test_parse_prerelease_alpha(self):
        """Parse version with alpha prerelease."""
        v = SemanticVersion.parse("1.0.0-alpha")
        assert v.major == 1
        assert v.minor == 0
        assert v.patch == 0
        assert v.prerelease == "alpha"

    def test_parse_prerelease_beta(self):
        """Parse version with beta prerelease."""
        v = SemanticVersion.parse("2.1.0-beta")
        assert v.prerelease == "beta"

    def test_parse_prerelease_with_number(self):
        """Parse version with numbered prerelease."""
        v = SemanticVersion.parse("1.0.0-beta.1")
        assert v.prerelease == "beta.1"

    def test_parse_prerelease_rc(self):
        """Parse version with release candidate."""
        v = SemanticVersion.parse("1.0.0-rc.2")
        assert v.prerelease == "rc.2"

    def test_parse_strips_v_prefix(self):
        """Parse version with 'v' prefix (common in git tags)."""
        v = SemanticVersion.parse("v1.2.3")
        assert v.major == 1
        assert v.minor == 2
        assert v.patch == 3

    def test_parse_strips_whitespace(self):
        """Parse version with surrounding whitespace."""
        v = SemanticVersion.parse("  1.2.3  ")
        assert v.major == 1
        assert v.minor == 2
        assert v.patch == 3


class TestSemanticVersionParsingErrors:
    """Tests for invalid version string rejection."""

    def test_empty_string_raises(self):
        """Empty string should raise InvalidVersionError."""
        with pytest.raises(InvalidVersionError, match="cannot be empty"):
            SemanticVersion.parse("")

    def test_invalid_format_raises(self):
        """Invalid format should raise InvalidVersionError."""
        with pytest.raises(InvalidVersionError, match="Invalid version format"):
            SemanticVersion.parse("not-a-version")

    def test_missing_patch_raises(self):
        """Missing patch number should raise InvalidVersionError."""
        with pytest.raises(InvalidVersionError, match="Invalid version format"):
            SemanticVersion.parse("1.2")

    def test_leading_zeros_major_raises(self):
        """Leading zeros in major should raise InvalidVersionError."""
        with pytest.raises(InvalidVersionError, match="Invalid version format"):
            SemanticVersion.parse("01.2.3")

    def test_leading_zeros_minor_raises(self):
        """Leading zeros in minor should raise InvalidVersionError."""
        with pytest.raises(InvalidVersionError, match="Invalid version format"):
            SemanticVersion.parse("1.02.3")

    def test_negative_numbers_raises(self):
        """Negative numbers should raise InvalidVersionError."""
        with pytest.raises(InvalidVersionError, match="Invalid version format"):
            SemanticVersion.parse("-1.2.3")

    def test_non_numeric_raises(self):
        """Non-numeric version parts should raise InvalidVersionError."""
        with pytest.raises(InvalidVersionError, match="Invalid version format"):
            SemanticVersion.parse("one.two.three")

    def test_try_parse_returns_none_on_error(self):
        """try_parse should return None instead of raising."""
        assert SemanticVersion.try_parse("invalid") is None
        assert SemanticVersion.try_parse("") is None

    def test_try_parse_returns_version_on_success(self):
        """try_parse should return SemanticVersion on success."""
        v = SemanticVersion.try_parse("1.2.3")
        assert v is not None
        assert v.major == 1


class TestSemanticVersionComparison:
    """Tests for version comparison operators."""

    def test_equal_versions(self):
        """Equal versions should be equal."""
        v1 = SemanticVersion.parse("1.2.3")
        v2 = SemanticVersion.parse("1.2.3")
        assert v1 == v2
        assert not v1 < v2
        assert not v1 > v2

    def test_major_comparison(self):
        """Major version should be most significant."""
        v1 = SemanticVersion.parse("1.9.9")
        v2 = SemanticVersion.parse("2.0.0")
        assert v1 < v2
        assert v2 > v1

    def test_minor_comparison(self):
        """Minor version comparison when major is equal."""
        v1 = SemanticVersion.parse("1.2.9")
        v2 = SemanticVersion.parse("1.3.0")
        assert v1 < v2
        assert v2 > v1

    def test_patch_comparison(self):
        """Patch version comparison when major.minor are equal."""
        v1 = SemanticVersion.parse("1.2.3")
        v2 = SemanticVersion.parse("1.2.4")
        assert v1 < v2
        assert v2 > v1

    def test_prerelease_less_than_release(self):
        """Pre-release version should be less than release version."""
        v_pre = SemanticVersion.parse("1.0.0-alpha")
        v_rel = SemanticVersion.parse("1.0.0")
        assert v_pre < v_rel
        assert v_rel > v_pre

    def test_prerelease_ordering(self):
        """Pre-release versions should be ordered correctly."""
        alpha = SemanticVersion.parse("1.0.0-alpha")
        beta = SemanticVersion.parse("1.0.0-beta")
        rc = SemanticVersion.parse("1.0.0-rc.1")
        release = SemanticVersion.parse("1.0.0")

        assert alpha < beta < rc < release

    def test_prerelease_numeric_ordering(self):
        """Numbered prereleases should be ordered numerically."""
        beta1 = SemanticVersion.parse("1.0.0-beta.1")
        beta2 = SemanticVersion.parse("1.0.0-beta.2")
        beta10 = SemanticVersion.parse("1.0.0-beta.10")

        assert beta1 < beta2 < beta10

    def test_comparison_chain(self):
        """Test a full version progression."""
        versions = [
            "0.1.0",
            "0.1.1",
            "0.2.0",
            "1.0.0-alpha",
            "1.0.0-beta",
            "1.0.0-rc.1",
            "1.0.0",
            "1.0.1",
            "1.1.0",
            "2.0.0",
        ]
        parsed = [SemanticVersion.parse(v) for v in versions]

        for i in range(len(parsed) - 1):
            assert parsed[i] < parsed[i + 1], f"{versions[i]} should be < {versions[i+1]}"


class TestOrderIndexComputation:
    """Tests for order_index computation."""

    def test_order_index_increases_with_version(self):
        """Order index should increase with version number."""
        v1 = SemanticVersion.parse("1.0.0")
        v2 = SemanticVersion.parse("1.0.1")
        v3 = SemanticVersion.parse("1.1.0")
        v4 = SemanticVersion.parse("2.0.0")

        assert v1.to_order_index() < v2.to_order_index()
        assert v2.to_order_index() < v3.to_order_index()
        assert v3.to_order_index() < v4.to_order_index()

    def test_order_index_prerelease_less_than_release(self):
        """Pre-release order index should be less than release."""
        pre = SemanticVersion.parse("1.0.0-beta")
        rel = SemanticVersion.parse("1.0.0")

        assert pre.to_order_index() < rel.to_order_index()

    def test_order_index_deterministic(self):
        """Order index should be deterministic."""
        v1 = SemanticVersion.parse("1.2.3")
        v2 = SemanticVersion.parse("1.2.3")

        assert v1.to_order_index() == v2.to_order_index()


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_compare_versions_less_than(self):
        """compare_versions should return -1 when v1 < v2."""
        assert compare_versions("1.0.0", "2.0.0") == -1

    def test_compare_versions_greater_than(self):
        """compare_versions should return 1 when v1 > v2."""
        assert compare_versions("2.0.0", "1.0.0") == 1

    def test_compare_versions_equal(self):
        """compare_versions should return 0 when v1 == v2."""
        assert compare_versions("1.0.0", "1.0.0") == 0

    def test_compare_versions_invalid_raises(self):
        """compare_versions should raise on invalid version."""
        with pytest.raises(InvalidVersionError):
            compare_versions("invalid", "1.0.0")

    def test_is_valid_version_true(self):
        """is_valid_version should return True for valid versions."""
        assert is_valid_version("1.0.0") is True
        assert is_valid_version("1.2.3-beta") is True
        assert is_valid_version("0.0.1") is True

    def test_is_valid_version_false(self):
        """is_valid_version should return False for invalid versions."""
        assert is_valid_version("invalid") is False
        assert is_valid_version("") is False
        assert is_valid_version("1.2") is False

    def test_version_greater_than_true(self):
        """version_greater_than should return True when new > current."""
        assert version_greater_than("2.0.0", "1.0.0") is True
        assert version_greater_than("1.0.1", "1.0.0") is True
        assert version_greater_than("1.0.0", "1.0.0-beta") is True

    def test_version_greater_than_false(self):
        """version_greater_than should return False when new <= current."""
        assert version_greater_than("1.0.0", "2.0.0") is False
        assert version_greater_than("1.0.0", "1.0.0") is False


class TestStringRepresentation:
    """Tests for string representation."""

    def test_str_simple(self):
        """String representation of simple version."""
        v = SemanticVersion.parse("1.2.3")
        assert str(v) == "1.2.3"

    def test_str_prerelease(self):
        """String representation of prerelease version."""
        v = SemanticVersion.parse("1.0.0-beta.1")
        assert str(v) == "1.0.0-beta.1"

    def test_repr(self):
        """repr should be informative."""
        v = SemanticVersion.parse("1.2.3")
        assert repr(v) == "SemanticVersion(1.2.3)"
