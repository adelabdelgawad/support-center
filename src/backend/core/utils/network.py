"""
Network utility functions for IP address extraction and validation.

This module provides utilities for extracting client IP addresses from HTTP
requests, with proper handling for proxy/load balancer scenarios.

SECURITY: Always use get_client_ip() instead of trusting client-provided
IP addresses in request bodies. This prevents IP spoofing attacks where
a malicious client could forge their IP address to bypass security checks.
"""

from typing import Optional
from fastapi import Request


def get_client_ip(request: Request) -> Optional[str]:
    """
    Extract the client's IP address from the request.

    This function implements the recommended pattern for extracting the true
    client IP when the application is behind a proxy or load balancer.

    Priority order:
    1. X-Forwarded-For header - set by trusted proxies (nginx, load balancers)
    2. X-Real-IP header - alternative header sometimes used by proxies
    3. request.client.host - direct connection IP

    The X-Forwarded-For header may contain a comma-separated list of IPs
    (e.g., "client_ip, proxy1_ip, proxy2_ip"). We extract the first IP
    which is the original client IP.

    Args:
        request: FastAPI Request object

    Returns:
        Client IP address as string, or None if unable to determine

    Example:
        # In an endpoint
        @router.post("/heartbeat")
        async def heartbeat(request: Request, ...):
            client_ip = get_client_ip(request)
            # Use client_ip for logging or security checks
    """
    # Try X-Forwarded-For first (most common in production behind nginx/load balancer)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # X-Forwarded-For may contain multiple IPs: "client, proxy1, proxy2"
        # The first (leftmost) IP is the original client
        client_ip = forwarded_for.split(",")[0].strip()
        return client_ip

    # Try X-Real-IP as fallback (alternative header used by some proxies)
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # Fall back to direct connection (development or no proxy)
    if request.client and request.client.host:
        return request.client.host

    # Unable to determine IP
    return None
