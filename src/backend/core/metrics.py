"""
Prometheus metrics for WebSocket monitoring.

This module defines all metrics for WebSocket operations including:
- Connection tracking (active, total, errors)
- Message throughput (sent, received, latency)
- Performance (initial load, query counts)
- Reliability (reconnects, gaps)

Usage:
    from core.metrics import (
        websocket_connections,
        websocket_active_connections,
        track_connection,
        track_initial_load
    )

    # Track connection
    with track_connection(endpoint="/chat", client_type="requester_app"):
        # Connection logic
        pass

    # Track initial load
    with track_initial_load():
        # Load logic
        pass
"""

from contextlib import asynccontextmanager
from time import time
from typing import Optional

from prometheus_client import Counter, Gauge, Histogram, Info

# ==============================================================================
# Connection Metrics
# ==============================================================================

websocket_connections = Counter(
    'websocket_connections_total',
    'Total WebSocket connections established',
    ['endpoint', 'client_type', 'status']
)

websocket_active_connections = Gauge(
    'websocket_active_connections',
    'Current number of active WebSocket connections',
    ['endpoint', 'client_type']
)

websocket_connection_errors = Counter(
    'websocket_connection_errors_total',
    'Total WebSocket connection failures',
    ['endpoint', 'error_code']
)

websocket_connection_duration = Histogram(
    'websocket_connection_duration_seconds',
    'Duration of WebSocket connections in seconds',
    ['endpoint', 'client_type'],
    buckets=(10, 30, 60, 120, 300, 600, 1800, 3600, 7200, float('inf'))
)

# ==============================================================================
# Message Metrics
# ==============================================================================

websocket_messages_sent = Counter(
    'websocket_messages_sent_total',
    'Total messages sent by server',
    ['message_type', 'endpoint']
)

websocket_messages_received = Counter(
    'websocket_messages_received_total',
    'Total messages received from clients',
    ['message_type', 'endpoint']
)

websocket_message_broadcast_latency = Histogram(
    'websocket_message_broadcast_latency_ms',
    'Time from message creation to broadcast in milliseconds',
    ['endpoint'],
    buckets=(10, 25, 50, 100, 200, 500, 1000, 2000, 5000, float('inf'))
)

websocket_message_loss = Counter(
    'websocket_message_loss_total',
    'Messages lost (not delivered)',
    ['endpoint', 'reason']
)

# ==============================================================================
# Initial Load Metrics
# ==============================================================================

websocket_initial_load_duration = Histogram(
    'websocket_initial_load_duration_ms',
    'Time to send initial_state in milliseconds',
    ['endpoint', 'client_type'],
    buckets=(50, 100, 200, 500, 1000, 2000, 5000, 10000, float('inf'))
)

websocket_initial_load_message_count = Histogram(
    'websocket_initial_load_message_count',
    'Number of messages in initial_state',
    ['endpoint'],
    buckets=(10, 25, 50, 100, 200, 500, 1000, 2000, 5000, float('inf'))
)

websocket_initial_load_query_count = Histogram(
    'websocket_initial_load_query_count',
    'Database queries executed during initial load',
    ['endpoint'],
    buckets=(1, 2, 3, 5, 10, 20, 50, 100, float('inf'))
)

websocket_initial_load_errors = Counter(
    'websocket_initial_load_errors_total',
    'Errors during initial state load',
    ['endpoint', 'error_type']
)

# ==============================================================================
# Heartbeat Metrics
# ==============================================================================

websocket_heartbeat_sent = Counter(
    'websocket_heartbeat_sent_total',
    'Total ping messages sent',
    ['endpoint']
)

websocket_heartbeat_received = Counter(
    'websocket_heartbeat_received_total',
    'Total pong messages received',
    ['endpoint']
)

websocket_heartbeat_rtt = Histogram(
    'websocket_heartbeat_rtt_ms',
    'Round-trip time for heartbeat in milliseconds',
    ['endpoint'],
    buckets=(5, 10, 25, 50, 100, 200, 500, 1000, float('inf'))
)

websocket_heartbeat_timeout = Counter(
    'websocket_heartbeat_timeout_total',
    'Heartbeat timeouts (no pong received)',
    ['endpoint']
)

# ==============================================================================
# Reconnection Metrics
# ==============================================================================

websocket_reconnect_attempts = Counter(
    'websocket_reconnect_attempts_total',
    'Total reconnection attempts',
    ['endpoint', 'reason']
)

websocket_reconnect_success = Counter(
    'websocket_reconnect_success_total',
    'Successful reconnections',
    ['endpoint']
)

websocket_reconnect_failure = Counter(
    'websocket_reconnect_failure_total',
    'Failed reconnections',
    ['endpoint', 'reason']
)

# ==============================================================================
# Gap Detection Metrics
# ==============================================================================

websocket_sequence_gaps_detected = Counter(
    'websocket_sequence_gaps_detected_total',
    'Sequence gaps detected by clients',
    ['endpoint', 'gap_size']
)

websocket_resync_requests = Counter(
    'websocket_resync_requests_total',
    'Resync requests from clients',
    ['endpoint']
)

websocket_resync_duration = Histogram(
    'websocket_resync_duration_ms',
    'Time to complete resync in milliseconds',
    ['endpoint'],
    buckets=(50, 100, 200, 500, 1000, 2000, 5000, float('inf'))
)

websocket_messages_recovered = Counter(
    'websocket_messages_recovered_total',
    'Messages recovered via resync',
    ['endpoint']
)

# ==============================================================================
# Database Metrics
# ==============================================================================

websocket_db_query_count = Histogram(
    'websocket_db_query_count',
    'Queries per initial_state',
    ['query_type'],
    buckets=(1, 2, 3, 5, 10, 20, 50, 100, float('inf'))
)

websocket_db_query_duration = Histogram(
    'websocket_db_query_duration_ms',
    'Database query duration in milliseconds',
    ['query_type'],
    buckets=(5, 10, 25, 50, 100, 200, 500, 1000, 2000, float('inf'))
)

# ==============================================================================
# System Info
# ==============================================================================

websocket_build_info = Info(
    'websocket_build_info',
    'WebSocket improvements version and build information'
)

# Set build info
websocket_build_info.info({
    'version': '1.0.0',
    'phase': 'phase-0-preparation'
})

# ==============================================================================
# Context Managers for Easy Tracking
# ==============================================================================

@asynccontextmanager
async def track_connection(
    endpoint: str,
    client_type: str,
    success: bool = True
):
    """
    Track WebSocket connection lifecycle.

    Usage:
        async with track_connection("/chat", "requester_app"):
            await connect_websocket()

    Args:
        endpoint: WebSocket endpoint (/ws or /chat)
        client_type: Type of client (requester_app, agent_portal)
        success: Whether connection succeeded
    """
    start_time = time()

    # Increment active connections
    websocket_active_connections.labels(
        endpoint=endpoint,
        client_type=client_type
    ).inc()

    try:
        yield
        # Track successful connection
        websocket_connections.labels(
            endpoint=endpoint,
            client_type=client_type,
            status='success'
        ).inc()
    except Exception as e:
        # Track failed connection
        websocket_connections.labels(
            endpoint=endpoint,
            client_type=client_type,
            status='failure'
        ).inc()
        raise
    finally:
        # Record connection duration
        duration = time() - start_time
        websocket_connection_duration.labels(
            endpoint=endpoint,
            client_type=client_type
        ).observe(duration)

        # Decrement active connections
        websocket_active_connections.labels(
            endpoint=endpoint,
            client_type=client_type
        ).dec()


@asynccontextmanager
async def track_initial_load(endpoint: str = "/chat", client_type: str = "unknown"):
    """
    Track initial state load performance.

    Usage:
        with track_initial_load() as tracker:
            # Load messages
            tracker.set_message_count(len(messages))
            tracker.set_query_count(3)

    Args:
        endpoint: WebSocket endpoint
        client_type: Type of client
    """
    start_time = time()

    class Tracker:
        def __init__(self):
            self.message_count = 0
            self.query_count = 0

        def set_message_count(self, count: int):
            self.message_count = count

        def set_query_count(self, count: int):
            self.query_count = count

    tracker = Tracker()

    try:
        yield tracker
    except Exception as e:
        # Track error
        websocket_initial_load_errors.labels(
            endpoint=endpoint,
            error_type=type(e).__name__
        ).inc()
        raise
    finally:
        # Record duration
        duration_ms = (time() - start_time) * 1000
        websocket_initial_load_duration.labels(
            endpoint=endpoint,
            client_type=client_type
        ).observe(duration_ms)

        # Record message count
        if tracker.message_count > 0:
            websocket_initial_load_message_count.labels(
                endpoint=endpoint
            ).observe(tracker.message_count)

        # Record query count
        if tracker.query_count > 0:
            websocket_initial_load_query_count.labels(
                endpoint=endpoint
            ).observe(tracker.query_count)


def track_message_sent(message_type: str, endpoint: str):
    """Track a sent message."""
    websocket_messages_sent.labels(
        message_type=message_type,
        endpoint=endpoint
    ).inc()


def track_message_received(message_type: str, endpoint: str):
    """Track a received message."""
    websocket_messages_received.labels(
        message_type=message_type,
        endpoint=endpoint
    ).inc()


def track_broadcast_latency(latency_ms: float, endpoint: str):
    """Track message broadcast latency."""
    websocket_message_broadcast_latency.labels(
        endpoint=endpoint
    ).observe(latency_ms)


def track_connection_error(endpoint: str, error_code: str):
    """Track connection error."""
    websocket_connection_errors.labels(
        endpoint=endpoint,
        error_code=error_code
    ).inc()


def track_heartbeat_sent(endpoint: str):
    """Track heartbeat ping sent."""
    websocket_heartbeat_sent.labels(endpoint=endpoint).inc()


def track_heartbeat_received(endpoint: str, rtt_ms: float):
    """Track heartbeat pong received."""
    websocket_heartbeat_received.labels(endpoint=endpoint).inc()
    websocket_heartbeat_rtt.labels(endpoint=endpoint).observe(rtt_ms)


def track_heartbeat_timeout(endpoint: str):
    """Track heartbeat timeout."""
    websocket_heartbeat_timeout.labels(endpoint=endpoint).inc()


def track_gap_detected(endpoint: str, gap_size: int):
    """Track sequence gap detection."""
    gap_label = "1" if gap_size == 1 else "2-5" if gap_size <= 5 else "6-10" if gap_size <= 10 else ">10"
    websocket_sequence_gaps_detected.labels(
        endpoint=endpoint,
        gap_size=gap_label
    ).inc()


def track_resync_request(endpoint: str):
    """Track resync request."""
    websocket_resync_requests.labels(endpoint=endpoint).inc()


def track_resync_completed(endpoint: str, duration_ms: float, messages_recovered: int):
    """Track resync completion."""
    websocket_resync_duration.labels(endpoint=endpoint).observe(duration_ms)
    websocket_messages_recovered.labels(endpoint=endpoint).inc(messages_recovered)


# ==============================================================================
# Business Metrics - Ticket Lifecycle
# ==============================================================================

ticket_created_total = Counter(
    'ticket_created_total',
    'Total tickets created',
    ['category', 'priority', 'created_by_role']
)

ticket_assigned_total = Counter(
    'ticket_assigned_total',
    'Total tickets assigned to agents',
    ['category', 'priority']
)

ticket_status_changed_total = Counter(
    'ticket_status_changed_total',
    'Total ticket status changes',
    ['from_status', 'to_status']
)

ticket_solved_total = Counter(
    'ticket_solved_total',
    'Total tickets marked as solved',
    ['category', 'resolution_time_bucket']
)

ticket_resolution_time_seconds = Histogram(
    'ticket_resolution_time_seconds',
    'Time from ticket creation to resolution',
    ['category', 'priority'],
    buckets=(300, 900, 1800, 3600, 7200, 14400, 28800, 86400, 172800, float('inf'))  # 5min to 2 days
)

tickets_open_by_status = Gauge(
    'tickets_open_by_status',
    'Current number of open tickets by status',
    ['status']
)

tickets_open_by_priority = Gauge(
    'tickets_open_by_priority',
    'Current number of open tickets by priority',
    ['priority']
)

# ==============================================================================
# Business Metrics - User Authentication
# ==============================================================================

auth_attempts_total = Counter(
    'auth_attempts_total',
    'Total authentication attempts',
    ['method', 'status']  # method: AD/password, status: success/failure
)

auth_duration_ms = Histogram(
    'auth_duration_ms',
    'Authentication duration in milliseconds',
    ['method'],
    buckets=(50, 100, 200, 500, 1000, 2000, 5000, 10000, float('inf'))
)

active_user_sessions = Gauge(
    'active_user_sessions',
    'Current number of active user sessions',
    ['role']
)

session_duration_seconds = Histogram(
    'session_duration_seconds',
    'User session duration',
    ['role'],
    buckets=(60, 300, 900, 1800, 3600, 7200, 14400, 28800, 86400, float('inf'))
)

# ==============================================================================
# Business Metrics - File Operations
# ==============================================================================

file_uploads_total = Counter(
    'file_uploads_total',
    'Total file uploads',
    ['file_type', 'size_bucket']  # size_bucket: <1MB, 1-5MB, 5-10MB, >10MB
)

file_upload_duration_ms = Histogram(
    'file_upload_duration_ms',
    'File upload duration in milliseconds',
    ['file_type'],
    buckets=(100, 500, 1000, 2000, 5000, 10000, 30000, 60000, float('inf'))
)

file_upload_size_bytes = Histogram(
    'file_upload_size_bytes',
    'File upload size distribution',
    ['file_type'],
    buckets=(1024, 10240, 102400, 1048576, 5242880, 10485760, 52428800, float('inf'))
)

minio_operations_total = Counter(
    'minio_operations_total',
    'Total MinIO storage operations',
    ['operation', 'status']  # operation: upload/download/delete, status: success/failure
)

minio_operation_duration_ms = Histogram(
    'minio_operation_duration_ms',
    'MinIO operation duration',
    ['operation'],
    buckets=(50, 100, 200, 500, 1000, 2000, 5000, 10000, float('inf'))
)

# ==============================================================================
# Database Metrics - Connection Pool
# ==============================================================================

db_pool_size = Gauge(
    'db_pool_size',
    'Database connection pool size'
)

db_pool_checked_out = Gauge(
    'db_pool_checked_out',
    'Number of database connections currently checked out'
)

db_pool_overflow = Gauge(
    'db_pool_overflow',
    'Number of connections beyond pool size'
)

db_pool_invalid = Gauge(
    'db_pool_invalid',
    'Number of invalid connections in pool'
)

db_pool_checkouts_total = Counter(
    'db_pool_checkouts_total',
    'Total connection pool checkouts'
)

db_pool_checkins_total = Counter(
    'db_pool_checkins_total',
    'Total connection pool checkins'
)

# ==============================================================================
# Database Metrics - Query Performance
# ==============================================================================

db_query_duration_ms = Histogram(
    'db_query_duration_ms',
    'Database query duration in milliseconds',
    ['query_type', 'table'],
    buckets=(5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000, float('inf'))
)

db_transaction_duration_ms = Histogram(
    'db_transaction_duration_ms',
    'Database transaction duration',
    ['transaction_type'],
    buckets=(10, 50, 100, 200, 500, 1000, 2000, 5000, float('inf'))
)

db_queries_total = Counter(
    'db_queries_total',
    'Total database queries executed',
    ['query_type', 'status']  # status: success/failure
)

db_transactions_total = Counter(
    'db_transactions_total',
    'Total database transactions',
    ['status']  # commit/rollback
)

db_deadlocks_total = Counter(
    'db_deadlocks_total',
    'Total database deadlocks detected'
)

# ==============================================================================
# Cache Metrics - Redis Operations
# ==============================================================================

cache_operations_total = Counter(
    'cache_operations_total',
    'Total cache operations',
    ['operation', 'status']  # operation: get/set/delete, status: hit/miss/success/failure
)

cache_operation_duration_ms = Histogram(
    'cache_operation_duration_ms',
    'Cache operation duration',
    ['operation'],
    buckets=(1, 5, 10, 25, 50, 100, 200, 500, float('inf'))
)

cache_hit_ratio = Gauge(
    'cache_hit_ratio',
    'Cache hit ratio (0.0 to 1.0)'
)

cache_size_bytes = Gauge(
    'cache_size_bytes',
    'Estimated cache size in bytes'
)

cache_keys_total = Gauge(
    'cache_keys_total',
    'Total number of keys in cache'
)

# ==============================================================================
# Background Task Metrics
# ==============================================================================

background_tasks_queued = Gauge(
    'background_tasks_queued',
    'Number of tasks waiting in queue',
    ['queue_name']
)

background_tasks_running = Gauge(
    'background_tasks_running',
    'Number of currently running background tasks',
    ['task_name']
)

background_tasks_completed_total = Counter(
    'background_tasks_completed_total',
    'Total background tasks completed',
    ['task_name', 'status']  # status: success/failure
)

background_task_duration_ms = Histogram(
    'background_task_duration_ms',
    'Background task execution duration',
    ['task_name'],
    buckets=(100, 500, 1000, 5000, 10000, 30000, 60000, 300000, float('inf'))
)

scheduler_jobs_total = Gauge(
    'scheduler_jobs_total',
    'Total number of scheduled jobs'
)

# ==============================================================================
# System Metrics - Process
# ==============================================================================

# Note: These are automatically provided by prometheus-client's process collector
# Listed here for documentation purposes:
# - process_cpu_seconds_total
# - process_resident_memory_bytes
# - process_virtual_memory_bytes
# - process_open_fds
# - process_max_fds
# - process_start_time_seconds

# ==============================================================================
# Helper Functions for Business Metrics
# ==============================================================================

def track_ticket_created(category: str, priority: str, created_by_role: str):
    """Track ticket creation."""
    ticket_created_total.labels(
        category=category,
        priority=priority,
        created_by_role=created_by_role
    ).inc()


def track_ticket_assigned(category: str, priority: str):
    """Track ticket assignment."""
    ticket_assigned_total.labels(
        category=category,
        priority=priority
    ).inc()


def track_ticket_status_change(from_status: str, to_status: str):
    """Track ticket status change."""
    ticket_status_changed_total.labels(
        from_status=from_status,
        to_status=to_status
    ).inc()


def track_ticket_solved(category: str, resolution_time_seconds: float):
    """Track ticket resolution."""
    # Determine resolution time bucket
    if resolution_time_seconds < 3600:
        bucket = "<1h"
    elif resolution_time_seconds < 14400:
        bucket = "1-4h"
    elif resolution_time_seconds < 86400:
        bucket = "4-24h"
    elif resolution_time_seconds < 172800:
        bucket = "1-2d"
    else:
        bucket = ">2d"

    ticket_solved_total.labels(
        category=category,
        resolution_time_bucket=bucket
    ).inc()


def track_auth_attempt(method: str, success: bool, duration_ms: float):
    """Track authentication attempt."""
    status = "success" if success else "failure"
    auth_attempts_total.labels(method=method, status=status).inc()
    auth_duration_ms.labels(method=method).observe(duration_ms)


def track_file_upload(file_type: str, size_bytes: int, duration_ms: float):
    """Track file upload."""
    # Determine size bucket
    if size_bytes < 1048576:
        size_bucket = "<1MB"
    elif size_bytes < 5242880:
        size_bucket = "1-5MB"
    elif size_bytes < 10485760:
        size_bucket = "5-10MB"
    else:
        size_bucket = ">10MB"

    file_uploads_total.labels(file_type=file_type, size_bucket=size_bucket).inc()
    file_upload_duration_ms.labels(file_type=file_type).observe(duration_ms)
    file_upload_size_bytes.labels(file_type=file_type).observe(size_bytes)


def track_minio_operation(operation: str, success: bool, duration_ms: float):
    """Track MinIO operation."""
    status = "success" if success else "failure"
    minio_operations_total.labels(operation=operation, status=status).inc()
    minio_operation_duration_ms.labels(operation=operation).observe(duration_ms)


def track_db_query(query_type: str, table: str, duration_ms: float, success: bool):
    """Track database query."""
    status = "success" if success else "failure"
    db_queries_total.labels(query_type=query_type, status=status).inc()
    db_query_duration_ms.labels(query_type=query_type, table=table).observe(duration_ms)


def track_cache_operation(operation: str, hit: Optional[bool], duration_ms: float):
    """
    Track cache operation.

    Args:
        operation: get/set/delete
        hit: True for hit, False for miss, None for set/delete
        duration_ms: Operation duration
    """
    if operation == "get":
        status = "hit" if hit else "miss"
    else:
        status = "success"

    cache_operations_total.labels(operation=operation, status=status).inc()
    cache_operation_duration_ms.labels(operation=operation).observe(duration_ms)


# ==============================================================================
# Version Authority Metrics
# ==============================================================================

version_policy_resolutions_total = Counter(
    'version_policy_resolutions_total',
    'Total version policy resolutions by status',
    ['platform', 'version_status']  # status: ok, outdated, outdated_enforced, unknown
)

version_enforcement_rejections_total = Counter(
    'version_enforcement_rejections_total',
    'Total login rejections due to version enforcement',
    ['platform', 'version_status', 'reason']  # reason: outdated_enforced, unknown
)

version_unknown_connections_total = Counter(
    'version_unknown_connections_total',
    'Total connections from unknown versions (not in registry)',
    ['platform']
)

version_outdated_enforced_connections_total = Counter(
    'version_outdated_enforced_connections_total',
    'Total connections from outdated_enforced versions',
    ['platform']
)

active_versions_by_status = Gauge(
    'active_versions_by_status',
    'Current active sessions by version status',
    ['platform', 'version_status']
)

version_enforcement_enabled = Gauge(
    'version_enforcement_enabled',
    'Whether version enforcement is enabled (1=enabled, 0=disabled)',
    ['platform']
)

# ==============================================================================
# Version Authority Helper Functions
# ==============================================================================

def track_version_policy_resolution(
    platform: str,
    version_status: str,
):
    """
    Track a version policy resolution.

    Args:
        platform: Platform (desktop, web, mobile)
        version_status: Resolved status (ok, outdated, outdated_enforced, unknown)
    """
    version_policy_resolutions_total.labels(
        platform=platform,
        version_status=version_status
    ).inc()


def track_version_enforcement_rejection(
    platform: str,
    version_status: str,
    reason: str,
):
    """
    Track a login rejection due to version enforcement.

    Args:
        platform: Platform (desktop, web, mobile)
        version_status: Version status that caused rejection
        reason: Rejection reason (outdated_enforced, unknown)
    """
    version_enforcement_rejections_total.labels(
        platform=platform,
        version_status=version_status,
        reason=reason
    ).inc()


def track_unknown_version_connection(platform: str):
    """Track a connection from an unknown version."""
    version_unknown_connections_total.labels(platform=platform).inc()


def track_outdated_enforced_connection(platform: str):
    """Track a connection from an outdated_enforced version."""
    version_outdated_enforced_connections_total.labels(platform=platform).inc()


def set_version_enforcement_status(platform: str, enabled: bool):
    """Set the version enforcement status gauge."""
    version_enforcement_enabled.labels(platform=platform).set(1 if enabled else 0)


# ==============================================================================
# Horizontal Scaling Metrics
# ==============================================================================

websocket_cluster_connections = Gauge(
    'websocket_cluster_connections_total',
    'Total WebSocket connections across all backend instances',
    ['instance_id']
)

websocket_cluster_rooms = Gauge(
    'websocket_cluster_rooms_total',
    'Total active chat rooms across all instances',
    ['instance_id']
)

websocket_cluster_subscriptions = Gauge(
    'websocket_cluster_subscriptions_total',
    'Total room subscriptions across all instances',
    ['instance_id']
)

websocket_cluster_instances = Gauge(
    'websocket_cluster_instances',
    'Number of healthy backend instances in the cluster'
)

redis_session_store_operations = Counter(
    'redis_session_store_operations_total',
    'Total Redis session store operations',
    ['operation', 'status']  # operation: register/unregister/subscribe/unsubscribe
)

redis_pubsub_messages = Counter(
    'redis_pubsub_messages_total',
    'Total Redis pub/sub messages for cross-instance broadcasting',
    ['channel_type', 'direction']  # channel_type: chat/notification, direction: sent/received
)

pgbouncer_connections = Gauge(
    'pgbouncer_connections',
    'PgBouncer connection pool stats',
    ['state']  # state: active/waiting/idle
)

# ==============================================================================
# Horizontal Scaling Helper Functions
# ==============================================================================

def track_cluster_stats(
    instance_id: str,
    connections: int,
    rooms: int,
    subscriptions: int
):
    """Track cluster-wide WebSocket statistics."""
    websocket_cluster_connections.labels(instance_id=instance_id).set(connections)
    websocket_cluster_rooms.labels(instance_id=instance_id).set(rooms)
    websocket_cluster_subscriptions.labels(instance_id=instance_id).set(subscriptions)


def track_session_store_operation(operation: str, success: bool):
    """Track Redis session store operation."""
    status = "success" if success else "failure"
    redis_session_store_operations.labels(
        operation=operation,
        status=status
    ).inc()


def track_pubsub_message(channel_type: str, direction: str):
    """Track Redis pub/sub message."""
    redis_pubsub_messages.labels(
        channel_type=channel_type,
        direction=direction
    ).inc()


def set_cluster_instance_count(count: int):
    """Set the number of healthy backend instances."""
    websocket_cluster_instances.set(count)


# ==============================================================================
# Event Transport Metrics (Redis Streams)
# ==============================================================================
# Metrics for the new Redis Streams event transport system (Feature 001)

event_publish_duration_seconds = Histogram(
    'event_publish_duration_seconds',
    'Time to publish event to transport layer',
    ['transport', 'event_type'],  # transport: http/redis_streams
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
)

event_delivery_duration_seconds = Histogram(
    'event_delivery_duration_seconds',
    'End-to-end time from publish to SignalR broadcast',
    ['event_type', 'transport'],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0)
)

event_queue_depth = Gauge(
    'event_queue_depth',
    'Number of events pending in Redis Streams (per stream)',
    ['stream']  # stream: events:chat, events:ticket, events:remote
)

events_published_total = Counter(
    'events_published_total',
    'Total events published to transport layer',
    ['transport', 'event_type', 'status']  # status: success/failure
)

events_coalesced_total = Counter(
    'events_coalesced_total',
    'Events coalesced (merged into single event)',
    ['event_type']
)

event_consumer_lag = Gauge(
    'event_consumer_lag',
    'Number of unprocessed entries in consumer group',
    ['stream', 'consumer_group']  # consumer_group: signalr-consumers
)

event_transport_fallback_total = Counter(
    'event_transport_fallback_total',
    'Number of times HTTP fallback was used when Redis Streams failed',
    ['reason']  # reason: redis_error, timeout, connection_lost
)

dual_write_status = Gauge(
    'event_dual_write_status',
    'Dual-write mode status (1=enabled, 0=disabled)',
)

dual_write_success_total = Counter(
    'event_dual_write_success_total',
    'Dual-write publish success counts',
    ['transport']  # transport: http/redis_streams
)

dual_write_failure_total = Counter(
    'event_dual_write_failure_total',
    'Dual-write publish failure counts',
    ['transport']
)


# ==============================================================================
# Event Transport Helper Functions
# ==============================================================================

def track_event_publish(
    transport: str,
    event_type: str,
    duration_seconds: float,
    success: bool
):
    """Track event publish to transport layer.

    Args:
        transport: Transport name (http, redis_streams)
        event_type: Event type (chat_message, typing_start, etc.)
        duration_seconds: Time taken to publish
        success: Whether publish succeeded
    """
    event_publish_duration_seconds.labels(
        transport=transport,
        event_type=event_type
    ).observe(duration_seconds)

    events_published_total.labels(
        transport=transport,
        event_type=event_type,
        status='success' if success else 'failure'
    ).inc()


def track_event_delivery(
    event_type: str,
    transport: str,
    duration_seconds: float
):
    """Track end-to-end event delivery latency.

    Args:
        event_type: Event type
        transport: Transport used
        duration_seconds: End-to-end duration
    """
    event_delivery_duration_seconds.labels(
        event_type=event_type,
        transport=transport
    ).observe(duration_seconds)


def track_event_coalesced(event_type: str, count: int):
    """Track event coalescing.

    Args:
        event_type: Event type that was coalesced
        count: Number of events merged
    """
    events_coalesced_total.labels(event_type=event_type).inc(count)


def update_event_queue_depth(stream: str, depth: int):
    """Update event queue depth gauge.

    Args:
        stream: Stream name (events:chat, events:ticket, etc.)
        depth: Current queue depth
    """
    event_queue_depth.labels(stream=stream).set(depth)


def update_consumer_lag(stream: str, consumer_group: str, lag: int):
    """Update consumer group lag gauge.

    Args:
        stream: Stream name
        consumer_group: Consumer group name
        lag: Number of unprocessed entries
    """
    event_consumer_lag.labels(
        stream=stream,
        consumer_group=consumer_group
    ).set(lag)


def track_transport_fallback(reason: str):
    """Track HTTP fallback from Redis Streams.

    Args:
        reason: Fallback reason (redis_error, timeout, connection_lost)
    """
    event_transport_fallback_total.labels(reason=reason).inc()


def set_dual_write_status(enabled: bool):
    """Set dual-write mode status gauge.

    Args:
        enabled: Whether dual-write is enabled
    """
    dual_write_status.set(1 if enabled else 0)


def track_dual_write_success(transport: str):
    """Track successful dual-write publish.

    Args:
        transport: Transport that succeeded
    """
    dual_write_success_total.labels(transport=transport).inc()


def track_dual_write_failure(transport: str):
    """Track failed dual-write publish.

    Args:
        transport: Transport that failed
    """
    dual_write_failure_total.labels(transport=transport).inc()
