"""
Remote Access tasks.

Queue: default celery queue (low priority)
Purpose: Remote access related background tasks

Note: The cleanup_expired_sessions task was removed as sessions are now auto-approved
(no pending state that needs expiration cleanup).
"""

import logging

from celery_app import celery_app

logger = logging.getLogger(__name__)

# No active tasks - all remote access operations are now synchronous
# This file is kept for potential future background tasks
