"""
Custom uvicorn logging configuration to capture invalid HTTP requests.

This module provides enhanced logging for uvicorn to track down
"Invalid HTTP request received" warnings.
"""

import logging

# Uvicorn logging configuration
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(asctime)s | %(name)s | %(levelname)s | %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "access": {
            "()": "uvicorn.logging.AccessFormatter",
            "fmt": '%(asctime)s | %(name)s | %(levelname)s | %(client_addr)s - "%(request_line)s" %(status_code)s',
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "default": {
            "formatter": "default",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stderr",
        },
        "access": {
            "formatter": "access",
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {
        "uvicorn": {
            "handlers": ["default"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.error": {
            "handlers": ["default"],
            "level": "INFO",  # Changed to INFO to capture warnings
            "propagate": False,
        },
        "uvicorn.access": {
            "handlers": ["access"],
            "level": "INFO",
            "propagate": False,
        },
    },
}


def setup_uvicorn_error_logging():
    """
    Setup enhanced error logging for uvicorn to capture invalid HTTP requests.

    This function configures the uvicorn.error logger to capture and log
    detailed information about invalid HTTP requests.
    """
    logger = logging.getLogger("uvicorn.error")

    # Create a custom handler that logs to both console and file
    from pathlib import Path
    from logging.handlers import RotatingFileHandler

    # Ensure logs directory exists
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    # Create file handler for invalid requests
    invalid_requests_log = log_dir / "invalid_requests.log"
    file_handler = RotatingFileHandler(
        invalid_requests_log,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding="utf-8",
    )

    file_formatter = logging.Formatter(
        fmt="%(asctime)s | %(name)s | %(levelname)s | %(funcName)s:%(lineno)d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    file_handler.setFormatter(file_formatter)
    file_handler.setLevel(logging.WARNING)

    # Add handler to uvicorn.error logger
    logger.addHandler(file_handler)

    # Also configure httptools and h11 loggers (HTTP parsing libraries used by uvicorn)
    for module in ["httptools", "h11"]:
        module_logger = logging.getLogger(module)
        module_logger.setLevel(logging.DEBUG)  # Capture all messages
        module_logger.addHandler(file_handler)

    logger.info("Enhanced uvicorn error logging configured - invalid requests will be logged to invalid_requests.log")
