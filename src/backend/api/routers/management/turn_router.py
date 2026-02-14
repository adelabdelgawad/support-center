"""
TURN server credentials endpoint for WebRTC NAT traversal.

Provides ICE server configuration including STUN and TURN servers
with time-limited credentials for secure WebRTC connections.
"""

import base64
import hashlib
import hmac
import time
from typing import List
from fastapi import APIRouter, Depends

from core.config import get_settings
from core.dependencies import get_current_user
from db import User
from core.schema_base import HTTPSchemaModel


router = APIRouter()


class ICEServer(HTTPSchemaModel):
    """ICE server configuration for WebRTC."""

    urls: str | List[str]
    username: str | None = None
    credential: str | None = None


class TURNCredentialsResponse(HTTPSchemaModel):
    """Response containing ICE server configuration."""

    ice_servers: List[ICEServer]
    ttl: int


def generate_turn_credentials(username: str, secret: str, ttl: int = 86400) -> tuple[str, str]:
    """
    Generate time-limited TURN credentials using HMAC-SHA1.

    This implements the time-limited credentials mechanism defined in
    RFC 5389 and draft-uberti-behave-turn-rest-00.

    Args:
        username: Base username for the TURN credentials
        secret: Shared secret for HMAC generation
        ttl: Time-to-live for credentials in seconds (default: 24 hours)

    Returns:
        Tuple of (username_with_timestamp, password)

    Example:
        >>> username, password = generate_turn_credentials("user123", "secret", 86400)
        >>> # username will be like: "1234567890:user123"
        >>> # password will be HMAC-SHA1 hash
    """
    timestamp = int(time.time()) + ttl
    username_with_timestamp = f"{timestamp}:{username}"

    # Generate HMAC-SHA1 and encode as base64 (required by TURN protocol)
    password = base64.b64encode(
        hmac.new(
            secret.encode('utf-8'),
            username_with_timestamp.encode('utf-8'),
            hashlib.sha1
        ).digest()
    ).decode('utf-8')

    return username_with_timestamp, password


@router.get("/credentials", response_model=TURNCredentialsResponse)
async def get_turn_credentials(
    current_user: User = Depends(get_current_user),
):
    """
    Get ICE server configuration with time-limited TURN credentials.

    Returns STUN servers for NAT discovery and TURN servers for relaying
    when direct peer-to-peer connections fail.

    TURN credentials are generated using HMAC-SHA1 with the user's username
    and expire after the configured TTL (default: 24 hours).

    Requires authentication. Only authenticated users can fetch credentials.

    Returns:
        TURNCredentialsResponse containing:
        - ice_servers: List of ICE servers (STUN + TURN)
        - ttl: Time-to-live for credentials in seconds

    Example response:
        {
          "iceServers": [
            {
              "urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
            },
            {
              "urls": "turn:supportcenter.andalusiagroup.net:3478",
              "username": "1703001234:johndoe",
              "credential": "a3f5d8e9..."
            }
          ],
          "ttl": 86400
        }
    """
    settings = get_settings()
    ice_servers: List[ICEServer] = []

    # Always include STUN servers as fallback for NAT discovery
    ice_servers.append(ICEServer(
        urls=["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
    ))

    # Add TURN server if enabled in configuration
    if settings.turn.enabled:
        turn_urls = [url.strip() for url in settings.turn.urls.split(",")]

        # Generate credentials
        if settings.turn.secret:
            # Use time-limited credentials (recommended for security)
            username, credential = generate_turn_credentials(
                username=current_user.username,
                secret=settings.turn.secret,
                ttl=settings.turn.ttl
            )
        else:
            # Fall back to static credentials (less secure)
            username = settings.turn.username
            credential = settings.turn.credential

        # Add each TURN URL as a separate ICE server
        for turn_url in turn_urls:
            ice_servers.append(ICEServer(
                urls=turn_url,
                username=username,
                credential=credential
            ))

    return TURNCredentialsResponse(
        ice_servers=ice_servers,
        ttl=settings.turn.ttl
    )
