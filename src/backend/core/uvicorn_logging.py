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
    detailed information about invalid HTTP requests to console.
    """
    logger = logging.getLogger("uvicorn.error")

    # Configure httptools and h11 loggers (HTTP parsing libraries used by uvicorn)
    # to capture detailed debug information for invalid requests
    for module in ["httptools", "h11"]:
        module_logger = logging.getLogger(module)
        module_logger.setLevel(logging.DEBUG)  # Capture all messages to console

    logger.info("Enhanced uvicorn error logging configured - invalid requests will be logged to console")
