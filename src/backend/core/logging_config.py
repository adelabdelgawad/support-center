"""
Logging configuration for the Service Catalog application.
Provides structured logging with different levels and formats.
"""

import logging
import logging.handlers
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from pydantic import BaseModel


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
    """Setup application logging with configuration."""
    if config is None:
        config = LogConfig()

    # Create logs directory if it doesn't exist and file logging is enabled
    if config.enable_file_logging:
        log_path = Path(config.log_dir)
        log_path.mkdir(exist_ok=True)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, config.level.upper()))

    # Clear existing handlers
    root_logger.handlers.clear()

    # Console handler with colors
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

    # File handler with rotation
    if config.enable_file_logging:
        # Main application log
        app_log_file = Path(config.log_dir) / "app.log"
        app_handler = logging.handlers.RotatingFileHandler(
            app_log_file,
            maxBytes=config.max_file_size,
            backupCount=config.backup_count,
            encoding="utf-8",
        )
        app_handler.setLevel(getattr(logging, config.level.upper()))

        app_formatter = logging.Formatter(
            fmt="%(asctime)s | %(name)s | %(levelname)s | %(funcName)s:%(lineno)d | %(message)s",
            datefmt=config.date_format,
        )
        app_handler.setFormatter(app_formatter)
        root_logger.addHandler(app_handler)

        # Session-specific log
        session_log_file = Path(config.log_dir) / "sessions.log"
        session_handler = logging.handlers.RotatingFileHandler(
            session_log_file,
            maxBytes=config.max_file_size,
            backupCount=config.backup_count,
            encoding="utf-8",
        )
        session_handler.setLevel(getattr(logging, config.level.upper()))
        session_handler.setFormatter(app_formatter)

        # Add session handler to session logger only
        session_logger = logging.getLogger("services.session_service")
        session_logger.addHandler(session_handler)
        session_logger.setLevel(getattr(logging, config.level.upper()))

        # Configure APScheduler logger to DEBUG level to reduce verbosity
        apscheduler_logger = logging.getLogger("apscheduler.executors.default")
        apscheduler_logger.setLevel(logging.DEBUG)
        apscheduler_logger.addHandler(app_handler)

        # Configure httpx logger to WARNING level to reduce verbosity
        httpx_logger = logging.getLogger("httpx")
        httpx_logger.setLevel(logging.WARNING)
        httpx_logger.addHandler(app_handler)

        # Database log
        db_log_file = Path(config.log_dir) / "database.log"
        db_handler = logging.handlers.RotatingFileHandler(
            db_log_file,
            maxBytes=config.max_file_size,
            backupCount=config.backup_count,
            encoding="utf-8",
        )
        db_handler.setLevel(getattr(logging, config.level.upper()))
        db_handler.setFormatter(app_formatter)

        # Add database handler to SQLAlchemy logger only if query logging is enabled
        sqlalchemy_logger = logging.getLogger("sqlalchemy.engine")
        sqlalchemy_logger.addHandler(db_handler)

        # Respect the ENABLE_QUERY_LOGGING setting for SQLAlchemy logger level
        from .config import settings

        if settings.performance.enable_query_logging:
            sqlalchemy_logger.setLevel(getattr(logging, config.level.upper()))
        else:
            sqlalchemy_logger.setLevel(
                logging.WARNING
            )  # Only show warnings and errors


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
