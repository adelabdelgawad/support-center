"""
Centralized error handling decorators for database operations.
Provides reusable decorators to wrap database operations with comprehensive
try-except blocks to gracefully handle potential failures.
"""
import functools
import inspect
import logging
import traceback
from typing import Any, Callable, Optional, Type, Union
from sqlalchemy.exc import (
    SQLAlchemyError,
    IntegrityError,
    OperationalError,
    DisconnectionError,
    TimeoutError,
    StatementError,
    InvalidRequestError,
    PendingRollbackError,
)
from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)


class DatabaseErrorHandler:
    """Centralized database error handling utilities."""
    
    # Common database exceptions to catch
    DATABASE_EXCEPTIONS = (
        SQLAlchemyError,
        IntegrityError,
        OperationalError,
        DisconnectionError,
        TimeoutError,
        StatementError,
        InvalidRequestError,
        PendingRollbackError,
        ConnectionError,
    )
    
    @staticmethod
    def handle_database_error(
        exc: Exception,
        operation: str,
        context: Optional[dict] = None
    ) -> tuple[bool, str]:
        """
        Handle database errors with detailed logging and classification.
        
        Args:
            exc: The exception that occurred
            operation: Description of the database operation
            context: Additional context information
            
        Returns:
            Tuple of (is_recoverable, error_message)
        """
        context_str = f" | Context: {context}" if context else ""
        
        if isinstance(exc, IntegrityError):
            error_msg = f"Database integrity error during {operation}: {str(exc)}{context_str}"
            logger.warning(error_msg)
            return False, error_msg
            
        elif isinstance(exc, (ConnectionError, DisconnectionError)):
            error_msg = f"Database connection error during {operation}: {str(exc)}{context_str}"
            logger.error(error_msg)
            return True, error_msg  # Connection errors are often recoverable
            
        elif isinstance(exc, TimeoutError):
            error_msg = f"Database timeout during {operation}: {str(exc)}{context_str}"
            logger.warning(error_msg)
            return True, error_msg  # Timeouts might be recoverable
            
        elif isinstance(exc, OperationalError):
            error_msg = f"Database operational error during {operation}: {str(exc)}{context_str}"
            logger.error(error_msg)
            return True, error_msg  # Operational errors might be recoverable
            
        elif isinstance(exc, StatementError):
            error_msg = f"Database statement error during {operation}: {str(exc)}{context_str}"
            logger.warning(error_msg)
            return False, error_msg  # Statement errors are usually not recoverable
            
        else:
            error_msg = f"Unexpected database error during {operation}: {type(exc).__name__}: {str(exc)}{context_str}"
            logger.error(f"{error_msg}\nTraceback: {traceback.format_exc()}")
            return False, error_msg


def handle_database_exceptions(
    operation_name: Optional[str] = None,
    reraise: bool = True,
    default_return: Any = None,
    log_level: str = "error"
) -> Callable:
    """
    Decorator to wrap database operations with comprehensive error handling.

    Args:
        operation_name: Name of the operation for logging (defaults to function name)
        reraise: Whether to re-raise the exception after logging
        default_return: Value to return if an error occurs and reraise=False
        log_level: Logging level for errors ('error', 'warning', 'info')

    Returns:
        Decorated function with error handling
    """
    def decorator(func: Callable) -> Callable:
        # Check if function is async (including already-wrapped async functions)
        is_async = inspect.iscoroutinefunction(func) or inspect.iscoroutinefunction(getattr(func, '__wrapped__', None))

        if not is_async:
            # Sync function wrapper
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs) -> Any:
                operation = operation_name or getattr(func, '__name__', 'unknown')
                context = {
                    "function": getattr(func, '__name__', 'unknown'),
                    "args_count": len(args),
                    "kwargs_keys": list(kwargs.keys()) if kwargs else []
                }

                try:
                    result = func(*args, **kwargs)
                    logger.debug(f"Successfully completed {operation}")
                    return result

                except DatabaseErrorHandler.DATABASE_EXCEPTIONS as exc:
                    is_recoverable, error_msg = DatabaseErrorHandler.handle_database_error(
                        exc, operation, context
                    )

                    if log_level == "error":
                        logger.error(error_msg)
                    elif log_level == "warning":
                        logger.warning(error_msg)
                    else:
                        logger.info(error_msg)

                    if reraise:
                        raise exc
                    else:
                        logger.info(f"Operation {operation} failed but continuing with default return: {default_return}")
                        return default_return

                except Exception as exc:
                    # Catch any other unexpected exceptions
                    error_msg = f"Unexpected error in {operation}: {type(exc).__name__}: {str(exc)}"
                    logger.error(f"{error_msg}\nTraceback: {traceback.format_exc()}")

                    if reraise:
                        raise exc
                    else:
                        return default_return

            return sync_wrapper

        # Async function wrapper
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            operation = operation_name or getattr(func, '__name__', 'unknown')
            context = {
                "function": getattr(func, '__name__', 'unknown'),
                "args_count": len(args),
                "kwargs_keys": list(kwargs.keys()) if kwargs else []
            }

            try:
                result = await func(*args, **kwargs)
                logger.debug(f"Successfully completed {operation}")
                return result

            except DatabaseErrorHandler.DATABASE_EXCEPTIONS as exc:
                is_recoverable, error_msg = DatabaseErrorHandler.handle_database_error(
                    exc, operation, context
                )

                if log_level == "error":
                    logger.error(error_msg)
                elif log_level == "warning":
                    logger.warning(error_msg)
                else:
                    logger.info(error_msg)

                if reraise:
                    raise exc
                else:
                    logger.info(f"Operation {operation} failed but continuing with default return: {default_return}")
                    return default_return

            except Exception as exc:
                # Catch any other unexpected exceptions
                error_msg = f"Unexpected error in {operation}: {type(exc).__name__}: {str(exc)}"
                logger.error(f"{error_msg}\nTraceback: {traceback.format_exc()}")

                if reraise:
                    raise exc
                else:
                    return default_return

        return async_wrapper

    return decorator


def database_transaction(
    operation_name: Optional[str] = None,
    commit_on_success: bool = True,
    rollback_on_error: bool = True
) -> Callable:
    """
    Decorator to handle database transactions with proper commit/rollback.

    Args:
        operation_name: Name of the operation for logging
        commit_on_success: Whether to commit on successful completion
        rollback_on_error: Whether to rollback on error

    Returns:
        Decorated function with transaction handling
    """
    def decorator(func: Callable) -> Callable:
        # Check if function is async BEFORE creating wrappers
        is_async = inspect.iscoroutinefunction(func) or inspect.iscoroutinefunction(getattr(func, '__wrapped__', None))

        if not is_async:
            # Sync function - just return it with a warning
            logger.warning(f"database_transaction decorator used on sync function {func.__name__}")
            return func

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            operation = operation_name or getattr(func, '__name__', 'unknown')

            # Find AsyncSession in arguments
            db_session: Optional[AsyncSession] = None
            for arg in args:
                if isinstance(arg, AsyncSession):
                    db_session = arg
                    break

            if not db_session:
                # Try to find in kwargs
                for key, value in kwargs.items():
                    if isinstance(value, AsyncSession):
                        db_session = value
                        break

            if not db_session:
                logger.warning(f"No AsyncSession found for transaction operation {operation}")
                return await func(*args, **kwargs)

            try:
                logger.debug(f"Starting database transaction for {operation}")
                result = await func(*args, **kwargs)

                if commit_on_success:
                    await db_session.commit()
                    logger.debug(f"Transaction committed for {operation}")

                return result

            except Exception as exc:
                if rollback_on_error:
                    try:
                        await db_session.rollback()
                        logger.debug(f"Transaction rolled back for {operation} due to error")
                    except Exception as rollback_exc:
                        logger.error(f"Failed to rollback transaction for {operation}: {rollback_exc}")

                # Let the exception propagate to be handled by handle_database_exceptions
                raise

        return async_wrapper

    return decorator


def log_database_operation(
    operation: str,
    level: str = "debug"
) -> Callable:
    """
    Decorator to log database operations with context.

    Args:
        operation: Description of the operation
        level: Logging level ('debug', 'info', 'warning', 'error')

    Returns:
        Decorated function with operation logging
    """
    def decorator(func: Callable) -> Callable:
        # Check if function is async (including already-wrapped async functions)
        is_async = inspect.iscoroutinefunction(func) or inspect.iscoroutinefunction(getattr(func, '__wrapped__', None))

        if not is_async:
            # Sync wrapper
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs) -> Any:
                logger_method = getattr(logger, level)
                func_name = getattr(func, '__name__', 'unknown')
                logger_method(f"Starting {operation} via {func_name}")

                try:
                    result = func(*args, **kwargs)
                    logger_method(f"Completed {operation} via {func_name}")
                    return result
                except Exception as exc:
                    logger_method(f"Failed {operation} via {func_name}: {str(exc)}")
                    raise

            return sync_wrapper

        # Async wrapper
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            logger_method = getattr(logger, level)
            func_name = getattr(func, '__name__', 'unknown')
            logger_method(f"Starting {operation} via {func_name}")

            try:
                result = await func(*args, **kwargs)
                logger_method(f"Completed {operation} via {func_name}")
                return result
            except Exception as exc:
                logger_method(f"Failed {operation} via {func_name}: {str(exc)}")
                raise

        return async_wrapper

    return decorator


# Convenience decorators for common patterns
def safe_database_query(func=None, operation_name: Optional[str] = None, default_return: Any = None) -> Callable:
    """
    Safe database query decorator that never raises exceptions.
    Use for read operations where you want to continue execution even on errors.

    Can be used with or without parentheses:
        @safe_database_query
        async def my_func(...): ...

        @safe_database_query()
        async def my_func(...): ...

        @safe_database_query(operation_name="custom name")
        async def my_func(...): ...

        @safe_database_query("custom name", default_return=[])
        async def my_func(...): ...
    """
    def decorator(f: Callable) -> Callable:
        return handle_database_exceptions(
            operation_name=operation_name,
            reraise=False,
            default_return=default_return,
            log_level="warning"
        )(f)

    # Handle different call patterns
    if func is None:
        # Called with parentheses: @safe_database_query() or @safe_database_query(operation_name="...")
        return decorator
    elif callable(func):
        # Called without parentheses: @safe_database_query
        return decorator(func)
    else:
        # Called with string as first positional arg: @safe_database_query("name", default_return=[])
        # In this case, func is actually the operation_name string
        return safe_database_query(operation_name=func, default_return=default_return)


def critical_database_operation(func=None, operation_name: Optional[str] = None) -> Callable:
    """
    Critical database operation decorator that always logs errors and reraises.
    Use for critical write operations that must succeed.

    Can be used with or without parentheses:
        @critical_database_operation
        async def my_func(...): ...

        @critical_database_operation()
        async def my_func(...): ...

        @critical_database_operation(operation_name="custom name")
        async def my_func(...): ...
    """
    def decorator(f: Callable) -> Callable:
        return handle_database_exceptions(
            operation_name=operation_name,
            reraise=True,
            log_level="error"
        )(f)

    # Handle different call patterns
    if func is None:
        # Called with parentheses
        return decorator
    elif callable(func):
        # Called without parentheses
        return decorator(func)
    else:
        # Called with operation_name as first positional arg
        return critical_database_operation(operation_name=func)


def transactional_database_operation(func=None, operation_name: Optional[str] = None) -> Callable:
    """
    Combined decorator for transactional database operations with error handling.

    Can be used with or without parentheses:
        @transactional_database_operation
        async def my_func(...): ...

        @transactional_database_operation()
        async def my_func(...): ...

        @transactional_database_operation("operation_name")
        async def my_func(...): ...

        @transactional_database_operation(operation_name="custom name")
        async def my_func(...): ...
    """
    def decorator(f: Callable) -> Callable:
        # Apply both transaction handling and error handling
        transaction_decorated = database_transaction(operation_name=operation_name)(f)
        return handle_database_exceptions(operation_name=operation_name, reraise=True)(transaction_decorated)

    # Handle different call patterns
    if func is None:
        # Called with parentheses: @transactional_database_operation() or @transactional_database_operation("name")
        return decorator
    elif callable(func):
        # Called without parentheses: @transactional_database_operation
        return decorator(func)
    else:
        # Called with string as first arg: @transactional_database_operation("name")
        # In this case, func is actually the operation_name string
        return transactional_database_operation(operation_name=func)