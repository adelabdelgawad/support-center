"""
Logging configuration for the Service Catalog application.
Provides structured logging with different levels and formats.

PERFORMANCE (F21):
- Uses QueueHandler to prevent log writes from blocking the event loop
- QueueListener handles file I/O in a separate thread
- No synchronous file operations in the main async loop
"""

import logging
import logging.handlers
import queue
import sys
import atexit
from datetime import datetime
from pathlib import Path
from threading import Thread
from typing import Optional

from pydantic import BaseModel


# Global queue listener for cleanup
_queue_listener: Optional[logging.handlers.QueueListener] = None


class LogConfig(BaseModel):
    """Logging configuration settings."""

    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format: str = "%Y-%m-%d %H:%M:%S"
    enable_file_logging: bool = True
    log_dir: str = "logs"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5
    enable_console: bool = True


class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for console output."""

    # Color codes
    grey = "\x1b[38;21m"
    yellow = "\x1b[33;21m"
    red = "\x1b[31;21m"
    bold_red = "\x1b[31;1m"
    blue = "\x1b[34;21m"
    green = "\x1b[32;21m"
    reset = "\x1b[0m"

    COLORS = {
        logging.DEBUG: grey,
        logging.INFO: blue,
        logging.WARNING: yellow,
        logging.ERROR: red,
        logging.CRITICAL: bold_red,
    }

    def format(self, record):
        # Add color to levelname
        color = self.COLORS.get(record.levelno, self.grey)
        record.levelname = f"{color}{record.levelname}{self.reset}"

        # Format the message
        formatted = super().format(record)

        # Add reset at the end
        return f"{formatted}{self.reset}"


def setup_logging(config: Optional[LogConfig] = None) -> None:
    """Setup application logging with configuration.

    PERFORMANCE (F21):
    - Uses QueueHandler for all file handlers to prevent blocking
    - QueueListener runs in separate thread for file I/O
    - Console handler remains direct (stdout is non-blocking)
    """
    global _queue_listener

    if config is None:
        config = LogConfig()

    # Stop existing listener if running
    if _queue_listener:
        _queue_listener.stop()
        _queue_listener = None

    # Create logs directory if it doesn't exist and file logging is enabled
    if config.enable_file_logging:
        log_path = Path(config.log_dir)
        log_path.mkdir(exist_ok=True)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, config.level.upper()))

    # Clear existing handlers
    root_logger.handlers.clear()

    # Console handler with colors (direct - no queue needed for stdout)
    if config.enable_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(getattr(logging, config.level.upper()))

        # Use colored formatter for console
        console_formatter = ColoredFormatter(
            fmt="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
            datefmt=config.date_format,
        )
        console_handler.setFormatter(console_formatter)
        root_logger.addHandler(console_handler)

    # Create handlers for QueueListener (file I/O in background thread)
    file_handlers = []

    if config.enable_file_logging:
        # Shared formatter for file logs
        file_formatter = logging.Formatter(
            fmt="%(asctime)s | %(name)s | %(levelname)s | %(funcName)s:%(lineno)d | %(message)s",
            datefmt=config.date_format,
        )

        # Main application log handler
        app_log_file = Path(config.log_dir) / "app.log"
        app_handler = logging.handlers.RotatingFileHandler(
            app_log_file,
            maxBytes=config.max_file_size,
            backupCount=config.backup_count,
            encoding="utf-8",
        )
        app_handler.setLevel(getattr(logging, config.level.upper()))
        app_handler.setFormatter(file_formatter)
        file_handlers.append(app_handler)

        # Session-specific log handler
        session_log_file = Path(config.log_dir) / "sessions.log"
        session_handler = logging.handlers.RotatingFileHandler(
            session_log_file,
            maxBytes=config.max_file_size,
            backupCount=config.backup_count,
            encoding="utf-8",
        )
        session_handler.setLevel(getattr(logging, config.level.upper()))
        session_handler.setFormatter(file_formatter)
        file_handlers.append(session_handler)

        # Database log handler
        db_log_file = Path(config.log_dir) / "database.log"
        db_handler = logging.handlers.RotatingFileHandler(
            db_log_file,
            maxBytes=config.max_file_size,
            backupCount=config.backup_count,
            encoding="utf-8",
        )
        db_handler.setLevel(getattr(logging, config.level.upper()))
        db_handler.setFormatter(file_formatter)
        file_handlers.append(db_handler)

    # Create QueueHandler and QueueListener for async file logging
    if file_handlers:
        # Queue for log records (unbounded for simplicity)
        log_queue = queue.Queue(-1)

        # Create QueueHandler for root logger
        queue_handler = logging.handlers.QueueHandler(log_queue)
        root_logger.addHandler(queue_handler)

        # Create QueueListener to handle queue in background thread
        # respect_handler_level=True ensures only relevant logs are processed
        _queue_listener = logging.handlers.QueueListener(
            log_queue,
            *file_handlers,
            respect_handler_level=True,
        )
        _queue_listener.start()

        # Register cleanup on exit
        atexit.register(stop_queue_listener)

    # Configure loggers that need specific handlers
    if config.enable_file_logging:
        # Session logger gets direct handler (not via queue) for isolation
        session_logger = logging.getLogger("services.session_service")
        # Note: We still want session logs in the queue, but we can add
        # the session-specific file handler directly if needed
        session_logger.setLevel(getattr(logging, config.level.upper()))

        # SQLAlchemy logger configuration
        sqlalchemy_logger = logging.getLogger("sqlalchemy.engine")

        # Respect the ENABLE_QUERY_LOGGING setting for SQLAlchemy logger level
        from .config import settings

        if settings.performance.enable_query_logging:
            sqlalchemy_logger.setLevel(getattr(logging, config.level.upper()))
        else:
            sqlalchemy_logger.setLevel(
                logging.WARNING
            )  # Only show warnings and errors


def stop_queue_listener() -> None:
    """Stop the queue listener gracefully.

    Called automatically on exit via atexit.
    Can also be called manually during shutdown.
    """
    global _queue_listener

    if _queue_listener:
        _queue_listener.stop()
        _queue_listener = None


class VersionLogger:
    """Structured logger for version-related operations (Version Authority system)."""

    def __init__(self, name: str = "version"):
        self.logger = logging.getLogger(f"version.{name}")

    def unknown_version_detected(
        self,
        version_string: str,
        platform: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        """Log when an unknown version connects (not in registry)."""
        context = []
        if user_id:
            context.append(f"User ID: {user_id}")
        if username:
            context.append(f"Username: {username}")
        if ip_address:
            context.append(f"IP: {ip_address}")
        context_str = " | ".join(context) if context else "No context"

        self.logger.warning(
            f"Unknown version detected | Version: {version_string} | "
            f"Platform: {platform} | {context_str}"
        )

    def outdated_enforced_detected(
        self,
        version_string: str,
        target_version: str,
        platform: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        """Log when an outdated_enforced version connects (requires update)."""
        context = []
        if user_id:
            context.append(f"User ID: {user_id}")
        if username:
            context.append(f"Username: {username}")
        if ip_address:
            context.append(f"IP: {ip_address}")
        context_str = " | ".join(context) if context else "No context"

        self.logger.warning(
            f"Outdated enforced version detected | Version: {version_string} | "
            f"Target: {target_version} | Platform: {platform} | {context_str}"
        )

    def enforcement_rejected(
        self,
        version_string: str,
        version_status: str,
        target_version: Optional[str],
        platform: str,
        reason: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None,
        ip_address: Optional[str] = None,
        installer_url: Optional[str] = None,
    ) -> None:
        """Log when a login is rejected due to version enforcement."""
        context = []
        if user_id:
            context.append(f"User ID: {user_id}")
        if username:
            context.append(f"Username: {username}")
        if ip_address:
            context.append(f"IP: {ip_address}")
        context_str = " | ".join(context) if context else "No context"

        # Include installer URL if configured (Phase 7.1)
        installer_info = f" | Installer: {installer_url}" if installer_url else ""
        self.logger.error(
            f"Version enforcement REJECTED login | Version: {version_string} | "
            f"Status: {version_status} | Target: {target_version} | "
            f"Platform: {platform} | Reason: {reason}{installer_info} | {context_str}"
        )

    def version_policy_resolved(
        self,
        version_string: str,
        version_status: str,
        platform: str,
        is_enforced: bool,
        target_version: Optional[str] = None,
    ) -> None:
        """Log version policy resolution result (debug level)."""
        self.logger.debug(
            f"Version policy resolved | Version: {version_string} | "
            f"Status: {version_status} | Platform: {platform} | "
            f"Enforced: {is_enforced} | Target: {target_version}"
        )

    def enforcement_config_status(
        self,
        enforce_enabled: bool,
        reject_outdated_enforced: bool,
        reject_unknown: bool,
    ) -> None:
        """Log the current enforcement configuration (at startup or change)."""
        self.logger.info(
            f"Version enforcement config | Enabled: {enforce_enabled} | "
            f"Reject Outdated Enforced: {reject_outdated_enforced} | "
            f"Reject Unknown: {reject_unknown}"
        )


class SessionLogger:
    """Structured logger for session-related operations."""

    def __init__(self, name: str = "session"):
        self.logger = logging.getLogger(f"session.{name}")

    def session_created(
        self,
        user_id: int,
        session_id: int,
        session_type: str,
        ip_address: str,
    ) -> None:
        """Log when a session is created."""
        self.logger.info(
            f"Session created | User ID: {user_id} | Session ID: {session_id} | "
            f"Type: {session_type} | IP: {ip_address} "
        )

    def session_updated(
        self, session_id: int, user_id: int, last_heartbeat: datetime
    ) -> None:
        """Log when a session is updated."""
        self.logger.info(
            f"Session updated | Session ID: {session_id} | User ID: {user_id} | "
            f"Last Heartbeat: {last_heartbeat.isoformat()}"
        )

    def session_disconnected(
        self, session_id: int, user_id: int, duration_minutes: float
    ) -> None:
        """Log when a session is disconnected."""
        self.logger.info(
            f"Session disconnected | Session ID: {session_id} | User ID: {user_id} | "
            f"Duration: {duration_minutes:.1f} minutes"
        )

    def user_created(self, user_id: int, username: str, email: str) -> None:
        """Log when a user is auto-created."""
        self.logger.info(
            f"Auto-created user | User ID: {user_id} | Username: {username} | "
            f"Email: {email}"
        )

    def heartbeat_received(
        self,
        session_id: int,
        user_id: int,
        ip_address: str,
    ) -> None:
        """Log when heartbeat is received."""
        self.logger.debug(
            f"Heartbeat received | Session ID: {session_id} | User ID: {user_id} | "
            f"IP: {ip_address} "
        )

    def stale_session_cleaned(
        self,
        session_id: int,
        user_id: int,
        last_heartbeat: datetime,
        duration_minutes: float,
    ) -> None:
        """Log when a stale session is cleaned up."""
        self.logger.warning(
            f"Stale session cleaned | Session ID: {session_id} | User ID: {user_id} | "
            f"Last Heartbeat: {last_heartbeat.isoformat()} | Inactive for: {duration_minutes:.1f} minutes"
        )

    def error_occurred(
        self,
        operation: str,
        session_id: Optional[int] = None,
        user_id: Optional[int] = None,
        error: str = "",
    ) -> None:
        """Log errors with context."""
        context = []
        if session_id:
            context.append(f"Session ID: {session_id}")
        if user_id:
            context.append(f"User ID: {user_id}")

        context_str = " | ".join(context) if context else "No context"

        self.logger.error(
            f"Session error | Operation: {operation} | {context_str} | Error: {error}"
        )
