"""
Async utilities for running blocking operations in an executor.

This module provides helper functions to offload blocking I/O operations
to a thread pool, preventing them from blocking the asyncio event loop.

Usage:
    from core.async_utils import run_blocking

    # Instead of: blocking_function()
    result = await run_blocking(blocking_function, arg1, arg2)
"""

import asyncio
from functools import partial
from typing import Any, Coroutine, TypeVar

T = TypeVar("T")


async def run_blocking(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """
    Run a blocking function in a separate thread to avoid blocking the event loop.

    This is the standard asyncio pattern for running synchronous I/O operations
    (file reads, network calls, image processing, etc.) without blocking.

    Args:
        func: The synchronous function to run
        *args: Positional arguments to pass to the function
        **kwargs: Keyword arguments to pass to the function

    Returns:
        The result of the function call

    Example:
        # Blocking I/O that would block the event loop:
        # content = file.read()

        # Non-blocking version:
        content = await run_blocking(file.read)

        # PIL Image operations:
        img = await run_blocking(Image.open, bytes_data)
        await run_blocking(img.save, buffer, format="JPEG")
    """
    loop = asyncio.get_running_loop()
    # Use None for the executor to use the default ThreadPoolExecutor
    return await loop.run_in_executor(None, partial(func, *args, **kwargs))


async def run_blocking_io(
    func: Callable[..., T],
    *args: Any,
    **kwargs: Any
) -> T:
    """
    Alias for run_blocking with semantic naming for I/O operations.

    Use this when the blocking operation is specifically I/O-bound
    (file reads, network calls, etc.) rather than CPU-bound.

    Args:
        func: The synchronous I/O function to run
        *args: Positional arguments to pass to the function
        **kwargs: Keyword arguments to pass to the function

    Returns:
        The result of the function call
    """
    return await run_blocking(func, *args, **kwargs)


# Type hint for Callable
from typing import Callable
