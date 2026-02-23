"""
Redis Circuit Breaker Wrapper

Provides circuit breaker functionality for Redis operations to prevent cascading failures.
Implements a simple circuit breaker pattern to monitor Redis connection errors and
automatically break/fuse circuits when Redis is unavailable.
"""

import logging
import time
from typing import Any, Awaitable, Callable, TypeVar
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitBreakerError(Exception):
    """Exception raised when circuit breaker is open."""
    pass


class RedisCircuitBreaker:
    """Circuit breaker wrapper for Redis operations.

    Prevents cascading failures when Redis is unavailable by:
    1. Opening circuit after consecutive failures
    2. Blocking Redis calls when circuit is open
    3. Periodically attempting to close (half-open) circuit
    """

    def __init__(
        self,
        max_failures: int = 5,
        reset_timeout: int = 30,
    ):
        """Initialize circuit breaker with custom configuration.

        Args:
            max_failures: Number of failures before opening circuit
            reset_timeout: Seconds to wait before attempting to close circuit
        """
        self.max_failures = max_failures
        self.reset_timeout = reset_timeout
        self.failure_count = 0
        self.last_failure_time = 0
        self.is_open = False
        self.last_attempt_time = 0

    async def execute(self, operation: Callable[..., Awaitable[T]], *args, **kwargs) -> T:
        """Execute operation with circuit breaker protection.

        Args:
            operation: Async operation to execute
            *args: Positional arguments for operation
            **kwargs: Keyword arguments for operation

        Returns:
            Result of operation

        Raises:
            CircuitBreakerError: If circuit is open
            Exception: Original exception from operation
        """
        # Check if circuit should be half-open
        if self.is_open and self._should_attempt_reset():
            logger.info("Circuit breaker: attempting reset (half-open)")
            self.is_open = False

        # Execute operation with protection
        try:
            if self.is_open:
                raise CircuitBreakerError("Circuit breaker is open - Redis unavailable")

            result = await operation(*args, **kwargs)

            # Reset on success
            self.failure_count = 0
            return result

        except CircuitBreakerError:
            # Re-raise circuit breaker errors
            raise
        except Exception as e:
            self._record_failure()
            raise e

    def _should_attempt_reset(self) -> bool:
        """Check if circuit should attempt to reset."""
        return time.time() - self.last_failure_time > self.reset_timeout

    def _record_failure(self):
        """Record a failure and update circuit state."""
        current_time = time.time()
        self.failure_count += 1
        self.last_failure_time = current_time

        if self.failure_count >= self.max_failures:
            self.is_open = True
            logger.warning(
                f"Circuit breaker opened after {self.failure_count} failures. "
                f"Will attempt reset in {self.reset_timeout}s"
            )

    @property
    def is_closed(self) -> bool:
        """Check if circuit breaker is closed (operational)."""
        return not self.is_open

    @property
    def state(self) -> str:
        """Get current circuit state."""
        if self.is_open:
            if self._should_attempt_reset():
                return "HALF-OPEN (testing)"
            else:
                return "OPEN (fused)"
        else:
            return "CLOSED (operational)"

    @property
    def next_reset(self) -> int:
        """Get seconds until next reset attempt."""
        if not self.is_open:
            return 0
        return max(0, int(self.reset_timeout - (time.time() - self.last_failure_time)))


# Global Redis circuit breaker instance
redis_circuit_breaker = RedisCircuitBreaker()


@asynccontextmanager
async def redis_operation_context(operation_name: str = "Redis operation"):
    """Context manager for Redis operations with circuit breaker.

    Args:
        operation_name: Name of operation for logging

    Yields:
        Circuit breaker instance

    Raises:
        CircuitBreakerError: If circuit is open
    """
    if not redis_circuit_breaker.is_closed:
        logger.warning(f"Circuit breaker is OPEN - blocking {operation_name}")
        raise CircuitBreakerError(f"Circuit breaker is OPEN - blocking {operation_name}")

    logger.debug(f"Allowing {operation_name} - circuit is {redis_circuit_breaker.state}")
    yield redis_circuit_breaker


class RedisCircuitBreakerMixin:
    """Mixin class to add circuit breaker functionality to Redis services."""

    def __init__(self):
        self.circuit_breaker = redis_circuit_breaker

    async def _execute_with_circuit_breaker(self, operation: Callable[..., T], *args, **kwargs) -> T:
        """Execute operation with circuit breaker protection."""
        return await self.circuit_breaker.execute(operation, *args, **kwargs)


# Circuit breaker state monitor
class CircuitBreakerMonitor:
    """Monitor and log circuit breaker state changes."""

    @staticmethod
    async def log_state_change() -> None:
        """Log circuit breaker state for monitoring."""
        logger.info(f"Redis circuit breaker state: {redis_circuit_breaker.state}")

        if redis_circuit_breaker.is_closed:
            logger.info("Redis circuit breaker is operational")
        else:
            logger.warning("Redis circuit breaker is non-operational - presence tracking degraded")

    @staticmethod
    async def get_health_status() -> dict[str, Any]:
        """Get circuit breaker health status for monitoring."""
        return {
            "circuit_state": redis_circuit_breaker.state,
            "is_operational": redis_circuit_breaker.is_closed,
            "failure_count": redis_circuit_breaker.failure_count,
            "next_reset_in_seconds": redis_circuit_breaker.next_reset
        }