"""
Semantic Version Comparison Utilities.

Provides deterministic, server-side semantic version parsing and comparison.
Used by the Version Authority system to validate version ordering.

Design Principles:
- Strict semantic versioning (major.minor.patch)
- Pre-release versions (e.g., 1.0.0-beta.1) are supported
- Comparison is deterministic and well-defined
- Invalid versions are rejected, not coerced
"""

import re
from dataclasses import dataclass
from functools import total_ordering
from typing import Optional, Tuple


class InvalidVersionError(ValueError):
    """Raised when a version string cannot be parsed."""

    pass


@total_ordering
@dataclass(frozen=True)
class SemanticVersion:
    """
    Represents a semantic version with comparison support.

    Supports versions like:
    - 1.0.0
    - 2.1.3
    - 1.0.0-alpha
    - 1.0.0-beta.1
    - 1.0.0-rc.2

    Pre-release versions are considered LESS than their release counterparts:
    - 1.0.0-alpha < 1.0.0-beta < 1.0.0-rc.1 < 1.0.0
    """

    major: int
    minor: int
    patch: int
    prerelease: Optional[str] = None

    # Regex pattern for semantic version parsing
    # Matches: major.minor.patch[-prerelease]
    _PATTERN = re.compile(
        r"^(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)"
        r"(?:-(?P<prerelease>[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*))?$"
    )

    @classmethod
    def parse(cls, version_string: str) -> "SemanticVersion":
        """
        Parse a version string into a SemanticVersion.

        Args:
            version_string: Version string (e.g., "1.0.0", "2.1.3-beta.1")

        Returns:
            SemanticVersion instance

        Raises:
            InvalidVersionError: If the version string is invalid
        """
        if not version_string:
            raise InvalidVersionError("Version string cannot be empty")

        # Strip whitespace and 'v' prefix
        version_string = version_string.strip()
        if version_string.lower().startswith("v"):
            version_string = version_string[1:]

        match = cls._PATTERN.match(version_string)
        if not match:
            raise InvalidVersionError(
                f"Invalid version format: '{version_string}'. "
                f"Expected format: major.minor.patch[-prerelease] (e.g., '1.0.0', '2.1.3-beta')"
            )

        return cls(
            major=int(match.group("major")),
            minor=int(match.group("minor")),
            patch=int(match.group("patch")),
            prerelease=match.group("prerelease"),
        )

    @classmethod
    def try_parse(cls, version_string: str) -> Optional["SemanticVersion"]:
        """
        Try to parse a version string, returning None on failure.

        Args:
            version_string: Version string to parse

        Returns:
            SemanticVersion or None if parsing fails
        """
        try:
            return cls.parse(version_string)
        except InvalidVersionError:
            return None

    def _compare_tuple(self) -> Tuple[int, int, int, bool, Tuple]:
        """
        Generate a comparison tuple for ordering.

        Pre-release versions sort before release versions.
        Pre-release identifiers are compared alphanumerically.
        """
        # Pre-release versions come BEFORE release versions
        # So 1.0.0-alpha (has_release=True) < 1.0.0 (has_release=False)
        has_prerelease = self.prerelease is not None

        # Parse prerelease parts for comparison
        prerelease_parts: Tuple = ()
        if self.prerelease:
            parts = []
            for part in self.prerelease.split("."):
                # Numeric parts compare as integers
                if part.isdigit():
                    parts.append((0, int(part)))
                else:
                    parts.append((1, part))
            prerelease_parts = tuple(parts)

        return (
            self.major,
            self.minor,
            self.patch,
            not has_prerelease,  # True (1) for release, False (0) for prerelease
            prerelease_parts,
        )

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, SemanticVersion):
            return NotImplemented
        return self._compare_tuple() == other._compare_tuple()

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, SemanticVersion):
            return NotImplemented
        return self._compare_tuple() < other._compare_tuple()

    def __str__(self) -> str:
        base = f"{self.major}.{self.minor}.{self.patch}"
        if self.prerelease:
            return f"{base}-{self.prerelease}"
        return base

    def __repr__(self) -> str:
        return f"SemanticVersion({self!s})"

    def to_order_index(self) -> int:
        """
        Convert version to an integer order index.

        This provides a numeric ordering that can be stored in the database
        and used for efficient version comparisons.

        Format: MMMM_NNNN_PPPP_R
        - M: Major (0-9999)
        - N: Minor (0-9999)
        - P: Patch (0-9999)
        - R: Release flag (0=prerelease, 1=release)

        Example: 1.2.3 -> 1_0002_0003_1 = 100020031
        """
        release_flag = 0 if self.prerelease else 1
        return (
            self.major * 100000000
            + self.minor * 10000
            + self.patch * 10
            + release_flag
        )


def compare_versions(v1: str, v2: str) -> int:
    """
    Compare two version strings.

    Args:
        v1: First version string
        v2: Second version string

    Returns:
        -1 if v1 < v2
         0 if v1 == v2
         1 if v1 > v2

    Raises:
        InvalidVersionError: If either version string is invalid
    """
    sv1 = SemanticVersion.parse(v1)
    sv2 = SemanticVersion.parse(v2)

    if sv1 < sv2:
        return -1
    elif sv1 > sv2:
        return 1
    return 0


def is_valid_version(version_string: str) -> bool:
    """
    Check if a version string is valid semantic version.

    Args:
        version_string: Version string to validate

    Returns:
        True if valid, False otherwise
    """
    return SemanticVersion.try_parse(version_string) is not None


def version_greater_than(new_version: str, current_version: str) -> bool:
    """
    Check if new_version is strictly greater than current_version.

    Args:
        new_version: The new version to check
        current_version: The current/existing version

    Returns:
        True if new_version > current_version

    Raises:
        InvalidVersionError: If either version is invalid
    """
    return compare_versions(new_version, current_version) > 0
