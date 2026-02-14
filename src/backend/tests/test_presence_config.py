"""
Unit tests for PresenceSettings configuration validation.

Tests cover:
- Valid TTL configuration (TTL >= 2x heartbeat interval)
- Invalid TTL configuration (TTL < 2x heartbeat interval raises ValidationError)
- Edge case: exactly 2x heartbeat interval (minimum valid TTL)
- Aggressive configuration: 2-minute heartbeat with 4-minute TTL
"""

import pytest
from pydantic import ValidationError

from core.config import PresenceSettings


class TestValidTTLConfiguration:
    """Tests for valid TTL configuration (TTL >= 2x heartbeat)."""

    def test_valid_ttl_configuration(self):
        """Test that valid TTL (2x heartbeat) is accepted."""
        # Default configuration: 300s heartbeat, 660s TTL
        settings = PresenceSettings()
        assert settings.heartbeat_interval_seconds == 300
        assert settings.ttl_seconds == 660
        # 660 >= 2 * 300 (600), so this is valid

    def test_valid_ttl_with_custom_heartbeat(self):
        """Test valid TTL with custom heartbeat interval."""
        # 60s heartbeat, 120s TTL (exactly 2x)
        settings = PresenceSettings(
            heartbeat_interval_seconds=60,
            ttl_seconds=120
        )
        assert settings.heartbeat_interval_seconds == 60
        assert settings.ttl_seconds == 120

    def test_valid_ttl_with_buffer(self):
        """Test valid TTL with additional buffer beyond minimum."""
        # 300s heartbeat, 900s TTL (3x heartbeat, well above minimum)
        settings = PresenceSettings(
            heartbeat_interval_seconds=300,
            ttl_seconds=900
        )
        assert settings.heartbeat_interval_seconds == 300
        assert settings.ttl_seconds == 900


class TestInvalidTTLConfiguration:
    """Tests for invalid TTL configuration (TTL < 2x heartbeat)."""

    def test_invalid_ttl_too_low(self):
        """Test that TTL < 2x heartbeat raises ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            PresenceSettings(
                heartbeat_interval_seconds=300,
                ttl_seconds=500  # 500 < 2 * 300 (600)
            )

        # Verify error message mentions the constraint
        error_detail = str(exc_info.value)
        assert "ttl_seconds" in error_detail
        assert "2x" in error_detail or "2 * heartbeat" in error_detail

    def test_invalid_ttl_equal_to_heartbeat(self):
        """Test that TTL = 1x heartbeat raises ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            PresenceSettings(
                heartbeat_interval_seconds=120,
                ttl_seconds=120  # 120 < 2 * 120 (240)
            )

        error_detail = str(exc_info.value)
        assert "ttl_seconds" in error_detail

    def test_invalid_ttl_zero(self):
        """Test that TTL = 0 raises ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            PresenceSettings(
                heartbeat_interval_seconds=60,
                ttl_seconds=0  # 0 < 2 * 60 (120)
            )

        error_detail = str(exc_info.value)
        assert "ttl_seconds" in error_detail


class TestEdgeCases:
    """Tests for edge case configurations."""

    def test_ttl_exactly_2x_heartbeat(self):
        """Test that exactly 2x heartbeat is valid (minimum)."""
        # Exactly 2x heartbeat interval (minimum valid TTL)
        settings = PresenceSettings(
            heartbeat_interval_seconds=300,
            ttl_seconds=600  # Exactly 2 * 300
        )
        assert settings.heartbeat_interval_seconds == 300
        assert settings.ttl_seconds == 600


class TestAggressiveConfiguration:
    """Tests for aggressive (low-latency) configuration."""

    def test_aggressive_configuration(self):
        """Test 2-minute heartbeat configuration with valid TTL."""
        # Aggressive configuration: 2-minute heartbeat, 4-minute TTL
        # This is useful for near real-time presence tracking
        settings = PresenceSettings(
            heartbeat_interval_seconds=120,
            ttl_seconds=240  # Exactly 2 * 120
        )
        assert settings.heartbeat_interval_seconds == 120
        assert settings.ttl_seconds == 240

    def test_aggressive_configuration_with_buffer(self):
        """Test 2-minute heartbeat with additional TTL buffer."""
        # 2-minute heartbeat, 5-minute TTL (with buffer)
        settings = PresenceSettings(
            heartbeat_interval_seconds=120,
            ttl_seconds=300  # 300 > 2 * 120 (240)
        )
        assert settings.heartbeat_interval_seconds == 120
        assert settings.ttl_seconds == 300

    def test_aggressive_configuration_invalid(self):
        """Test that 2-minute heartbeat with insufficient TTL raises ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            PresenceSettings(
                heartbeat_interval_seconds=120,
                ttl_seconds=200  # 200 < 2 * 120 (240)
            )

        error_detail = str(exc_info.value)
        assert "ttl_seconds" in error_detail


class TestConfigurationValues:
    """Tests for specific configuration value scenarios."""

    def test_standard_5_minute_heartbeat(self):
        """Test standard 5-minute heartbeat (default production config)."""
        settings = PresenceSettings(
            heartbeat_interval_seconds=300,
            ttl_seconds=660  # 11 minutes (with buffer)
        )
        assert settings.heartbeat_interval_seconds == 300
        assert settings.ttl_seconds == 660

    def test_minimum_1_minute_heartbeat(self):
        """Test minimum 1-minute heartbeat configuration."""
        settings = PresenceSettings(
            heartbeat_interval_seconds=60,
            ttl_seconds=120  # Exactly 2 * 60
        )
        assert settings.heartbeat_interval_seconds == 60
        assert settings.ttl_seconds == 120

    def test_large_heartbeat_interval(self):
        """Test large heartbeat interval (30 minutes)."""
        settings = PresenceSettings(
            heartbeat_interval_seconds=1800,
            ttl_seconds=3600  # Exactly 2 * 1800 (1 hour)
        )
        assert settings.heartbeat_interval_seconds == 1800
        assert settings.ttl_seconds == 3600
