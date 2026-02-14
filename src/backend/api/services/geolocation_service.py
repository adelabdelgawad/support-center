"""Geolocation service for IP-based location tracking and anomaly detection."""

import logging
from pathlib import Path
from typing import Optional

import geoip2.database
from sqlalchemy.ext.asyncio import AsyncSession

# Module-level logger
logger = logging.getLogger(__name__)

# GeoIP database path
GEOIP_DB_PATH = Path("/data/geoip/GeoLite2-City.mmdb")


class GeolocationService:
    """Service for geolocation lookups using GeoIP2 database."""

    _reader: Optional[geoip2.database.Reader] = None

    @classmethod
    def _get_reader(cls) -> geoip2.database.Reader:
        """
        Get or create the GeoIP2 database reader (lazy initialization).

        Returns:
            GeoIP2 database Reader instance

        Raises:
            FileNotFoundError: If GeoIP database file doesn't exist
            geoip2.errors.AddressNotFoundError: If database is invalid
        """
        if cls._reader is None:
            if not GEOIP_DB_PATH.exists():
                logger.error(f"GeoIP database not found at: {GEOIP_DB_PATH}")
                raise FileNotFoundError(f"GeoIP database not found at: {GEOIP_DB_PATH}")

            cls._reader = geoip2.database.Reader(str(GEOIP_DB_PATH))
            logger.info(f"GeoIP database loaded from: {GEOIP_DB_PATH}")

        return cls._reader

    @classmethod
    def get_country(cls, ip_address: str) -> Optional[str]:
        """
        Get ISO 3166-1 alpha-2 country code for an IP address.

        Args:
            ip_address: IP address to lookup

        Returns:
            Two-letter country code (e.g., 'US', 'GB', 'AE') or None if lookup fails
        """
        try:
            reader = cls._get_reader()
            response = reader.city(ip_address)

            if hasattr(response.country, "iso_code"):
                country_code = response.country.iso_code
                logger.debug(f"GeoIP lookup for {ip_address}: {country_code}")
                return country_code

            logger.debug(f"No country code found for IP: {ip_address}")
            return None

        except FileNotFoundError:
            logger.warning("GeoIP database not available")
            return None
        except Exception as e:
            logger.warning(f"GeoIP lookup failed for {ip_address}: {e}")
            return None

    @classmethod
    def is_country_change(
        cls, old_ip: str, new_ip: str
    ) -> tuple[bool, Optional[str], Optional[str]]:
        """
        Check if two IP addresses are from different countries.

        Args:
            old_ip: Original IP address
            new_ip: New IP address to compare

        Returns:
            Tuple of (is_different, old_country, new_country)
            - is_different: True if countries differ
            - old_country: Country code for old_ip (or None)
            - new_country: Country code for new_ip (or None)
        """
        old_country = cls.get_country(old_ip)
        new_country = cls.get_country(new_ip)

        if old_country and new_country and old_country != new_country:
            logger.info(
                f"Country change detected | Old IP: {old_ip} ({old_country}) -> "
                f"New IP: {new_ip} ({new_country})"
            )
            return True, old_country, new_country

        return False, old_country, new_country

    @classmethod
    def close(cls) -> None:
        """Close the GeoIP database reader."""
        if cls._reader is not None:
            cls._reader.close()
            cls._reader = None
            logger.info("GeoIP database reader closed")


# Convenience instance methods for use in services
class GeolocationServiceInstance:
    """Instance-based geolocation service for injection into other services."""

    def __init__(self, db: AsyncSession):
        """
        Initialize geolocation service (db session unused but kept for consistency).

        Args:
            db: Database session (unused, for API compatibility)
        """
        self._db = db

    def get_country(self, ip_address: str) -> Optional[str]:
        """Get country code for IP address."""
        return GeolocationService.get_country(ip_address)

    def is_country_change(
        self, old_ip: str, new_ip: str
    ) -> tuple[bool, Optional[str], Optional[str]]:
        """Check if two IPs are from different countries."""
        return GeolocationService.is_country_change(old_ip, new_ip)
