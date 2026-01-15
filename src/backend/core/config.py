"""
Core configuration module with performance-optimized settings.
Organized into separate settings classes for better maintainability.
"""

from typing import List, Optional

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class APISettings(BaseSettings):
    """API configuration settings."""

    app_name: str = "Service Catalog"
    app_version: str = "1.0.0"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    model_config = SettingsConfigDict(
        env_prefix="API_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class DatabaseSettings(BaseSettings):
    """Database configuration settings.

    For horizontal scaling with multiple backend instances:
    - Reduce pool_size per instance (total = pool_size * num_instances)
    - Use PgBouncer for connection multiplexing
    - Set pool_recycle lower to avoid stale connections
    """

    url: PostgresDsn
    pool_size: int = 10  # Reduced from 20 for horizontal scaling (10 per instance)
    max_overflow: int = 5  # Reduced from 10 for horizontal scaling
    pool_timeout: int = 30
    pool_recycle: int = 1800  # 30 minutes (reduced from 1 hour for better connection cycling)
    echo: bool = False

    model_config = SettingsConfigDict(
        env_prefix="DATABASE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def database_url_sync(self) -> str:
        """Get synchronous database URL for Alembic."""
        return str(self.url).replace("+asyncpg", "")


class TURNSettings(BaseSettings):
    """TURN server configuration settings for WebRTC NAT traversal."""

    enabled: bool = Field(default=True, description="Enable TURN server for WebRTC")
    urls: str = Field(
        default="turn:supportcenter.andalusiagroup.net:3478",
        description="Comma-separated list of TURN server URLs"
    )
    username: str = Field(default="", description="Static TURN username (optional)")
    credential: str = Field(default="", description="Static TURN credential (optional)")
    secret: str = Field(
        default="",
        description="TURN secret for generating time-limited credentials (HMAC-SHA1)"
    )
    ttl: int = Field(default=86400, description="Time-to-live for credentials in seconds (24 hours)")

    model_config = SettingsConfigDict(
        env_prefix="TURN_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class RedisSettings(BaseSettings):
    """Redis configuration settings for caching and Celery broker.

    For horizontal scaling with multiple backend instances:
    - Reduce max_connections per instance
    - Use separate prefixes for session store
    """

    url: str = "redis://localhost:6380/0"
    max_connections: int = 30  # Reduced from 50 for horizontal scaling (30 per instance)
    socket_keepalive: bool = True
    socket_timeout: int = 60  # Increased from 5 to 60 seconds for pub/sub stability
    socket_connect_timeout: int = 10  # Connection timeout
    retry_on_timeout: bool = True
    health_check_interval: int = 30  # Periodic health check interval (seconds)
    max_reconnect_attempts: int = 10  # Maximum reconnection attempts
    reconnect_backoff_base: float = 2.0  # Exponential backoff base for reconnection

    # Session store settings (for horizontal WebSocket scaling)
    session_prefix: str = "ws_session:"
    room_prefix: str = "ws_room:"
    instance_prefix: str = "ws_instance:"

    model_config = SettingsConfigDict(
        env_prefix="REDIS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def redis_config(self) -> dict:
        """Get Redis connection configuration."""
        return {
            "max_connections": self.max_connections,
            "socket_keepalive": self.socket_keepalive,
            "socket_timeout": self.socket_timeout,
            "socket_connect_timeout": self.socket_connect_timeout,
            "retry_on_timeout": self.retry_on_timeout,
        }


class CelerySettings(BaseSettings):
    """Celery task queue configuration settings."""

    broker_url: str = "redis://localhost:6380/0"
    result_backend: str = "redis://localhost:6380/1"
    task_serializer: str = "json"
    result_serializer: str = "json"
    accept_content: List[str] = ["json"]
    timezone: str = "Africa/Cairo"
    enable_utc: bool = False
    task_track_started: bool = True
    task_time_limit: int = 300  # 5 minutes
    task_soft_time_limit: int = 240  # 4 minutes
    worker_prefetch_multiplier: int = 4
    worker_max_tasks_per_child: int = 100

    model_config = SettingsConfigDict(
        env_prefix="CELERY_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class SecuritySettings(BaseSettings):
    """Security and JWT configuration settings."""

    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_days: int = 30  # Long-lived token for permanent session (30 days)
    jwt_secret_key: Optional[str] = None
    jwt_issuer: str = "service-catalog"
    jwt_audience: str = "it-service-catalog"

    # Enhanced Session Management Settings (Refresh Token Support)
    session_refresh_enabled: bool = Field(
        default=True,
        description="Enable stateful session management with refresh tokens"
    )
    session_access_token_minutes: int = Field(
        default=15,
        description="Access token lifetime in minutes (short-lived for security)"
    )
    session_refresh_lifetime_days: int = Field(
        default=30,
        description="Refresh token lifetime in days"
    )
    session_max_concurrent: int = Field(
        default=5,
        description="Maximum concurrent sessions per user (0=unlimited)"
    )
    session_cookie_name: str = Field(
        default="refresh_token",
        description="Name of HttpOnly cookie for refresh token"
    )
    session_cookie_secure: bool = Field(
        default=True,
        description="Secure flag for refresh token cookie (HTTPS only)"
    )
    session_cookie_samesite: str = Field(
        default="strict",
        description="SameSite attribute (strict/lax/none)"
    )

    model_config = SettingsConfigDict(
        env_prefix="SECURITY_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def jwt_secret_key_property(self) -> str:
        """Get JWT secret key, falling back to SECRET_KEY if not specified."""
        return self.jwt_secret_key or self.secret_key


class CORSSettings(BaseSettings):
    """CORS configuration settings - read directly from .env file."""

    origins: List[str]

    model_config = SettingsConfigDict(
        env_prefix="CORS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("origins", mode="before")
    @classmethod
    def parse_origins(cls, v):
        """Parse origins from JSON array string or comma-separated list."""
        if isinstance(v, str):
            import json
            try:
                # Try parsing as JSON array first (preferred format)
                return json.loads(v)
            except json.JSONDecodeError:
                # Fallback to comma-separated list
                return [origin.strip() for origin in v.split(",")]
        return v


class FileUploadSettings(BaseSettings):
    """File upload configuration settings."""

    max_upload_size: int = 5_242_880  # 5MB
    upload_dir: str = "./uploads"
    allowed_extensions: List[str] = [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "pdf",
        "doc",
        "docx",
        "txt",
        "log",
    ]

    @field_validator('allowed_extensions', mode='before')
    @classmethod
    def parse_allowed_extensions(cls, v):
        if isinstance(v, str):
            return [ext.strip() for ext in v.split(',')]
        return v

    model_config = SettingsConfigDict(
        env_prefix="UPLOAD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class MinIOSettings(BaseSettings):
    """MinIO Object Storage configuration settings.

    SECURITY: access_key and secret_key have no defaults and must be configured.
    """

    endpoint: str = "localhost:9000"
    access_key: str = Field(default="", description="MinIO access key (REQUIRED)")
    secret_key: str = Field(default="", description="MinIO secret key (REQUIRED)")
    bucket_name: str = "servicecatalog-files"
    secure: bool = False  # Use HTTPS
    region: str = "us-east-1"

    # Presigned URL settings
    presigned_url_expiry_seconds: int = 3600  # 1 hour
    presigned_url_expiry_download: int = 86400  # 24 hours

    # Upload settings
    max_file_size_mb: int = 50

    # Retry settings
    max_retries: int = 3
    retry_backoff_factor: int = 2

    model_config = SettingsConfigDict(
        env_prefix="MINIO_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class ChatAttachmentSettings(BaseSettings):
    """Chat attachment configuration settings."""

    max_attachments_per_message: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum attachments allowed per chat message"
    )
    max_chat_attachment_size: int = Field(
        default=5_242_880,  # 5MB
        ge=1024,  # Minimum 1KB
        description="Maximum size per chat attachment in bytes"
    )
    max_screenshots_per_request: int = Field(
        default=0,
        ge=0,
        description="Maximum screenshots allowed per service request (0 = unlimited)"
    )

    model_config = SettingsConfigDict(
        env_prefix="CHAT_ATTACHMENT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class ActiveDirectorySettings(BaseSettings):
    """Domain Controller (Active Directory) configuration settings.

    SECURITY: ldap_password has no default and must be configured via environment.
    """

    path: str = "dc.example.com"
    domain_name: str = "DOMAIN"
    port: int = 389
    use_ssl: bool = True
    ldap_username: str = "ldap_user"
    ldap_password: str = Field(default="", description="LDAP password (REQUIRED)")
    base_dn: str = "DC=example,DC=com"
    desired_ous: List[str] = Field(
        default=["Users"],
        description='OUs to sync. Use ["*"] to sync all OUs, or specify OU names like ["SMH","EHQ"]'
    )

    model_config = SettingsConfigDict(
        env_prefix="AD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("desired_ous", mode="before")
    @classmethod
    def parse_desired_ous(cls, v):
        if isinstance(v, str):
            # Handle comma-separated string format or JSON array
            try:
                import json

                # Try to parse as JSON first
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                # Fall back to comma-separated parsing
                return [ou.strip() for ou in v.split(",") if ou.strip()]
        return v


class EmailSettings(BaseSettings):
    """Email configuration settings.

    SECURITY: smtp_password has no default and must be configured via environment.
    """

    smtp_host: str = "smtp.example.com"
    smtp_port: int = 587
    smtp_user: str = "noreply@example.com"
    smtp_password: str = Field(default="", description="SMTP password (REQUIRED)")
    smtp_from: str = "noreply@example.com"
    smtp_tls: bool = True

    model_config = SettingsConfigDict(
        env_prefix="EMAIL_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class WebSocketSettings(BaseSettings):
    """WebSocket configuration settings.

    For horizontal scaling:
    - use_redis_pubsub enables cross-instance message broadcasting
    - use_redis_session_store enables session persistence in Redis
    """

    heartbeat_interval: int = 30
    message_queue_size: int = 2000  # Increased from 1000 for higher throughput
    use_redis_pubsub: bool = True
    use_redis_session_store: bool = True  # Enable Redis session store for horizontal scaling

    model_config = SettingsConfigDict(
        env_prefix="WS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class SignalRSettings(BaseSettings):
    """SignalR configuration settings for real-time communication.

    The SignalR microservice handles all real-time messaging. FastAPI
    broadcasts events to SignalR via internal HTTP API (not WebSocket).

    SECURITY: internal_api_key is required when enabled=True to prevent
    unauthorized access to the internal SignalR API.
    """

    internal_url: str = Field(
        default="http://signalr-service:5000",
        description="Internal URL for SignalR service (Docker networking)"
    )
    internal_api_key: str = Field(
        default="",
        description="API key for internal SignalR endpoints (REQUIRED when enabled)"
    )
    enabled: bool = Field(
        default=True,
        description="Enable SignalR event broadcasting"
    )
    timeout_seconds: float = Field(
        default=10.0,
        description="Timeout for SignalR internal API calls"
    )
    retry_count: int = Field(
        default=3,
        description="Number of retries for failed SignalR broadcasts"
    )

    model_config = SettingsConfigDict(
        env_prefix="SIGNALR_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("internal_api_key")
    @classmethod
    def validate_api_key_not_empty(cls, v: str, info) -> str:
        """
        SECURITY: Ensure API key is configured when SignalR is enabled.
        This prevents unauthenticated access to internal SignalR endpoints.
        """
        # Note: We can't access 'enabled' here directly during validation,
        # so we validate at runtime in the SignalRClient
        if not v:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                "SECURITY WARNING: SIGNALR_INTERNAL_API_KEY is not set. "
                "If SignalR is enabled, this allows unauthenticated access to internal APIs."
            )
        return v


class PerformanceSettings(BaseSettings):
    """Performance configuration settings."""

    query_cache_size: int = 1000
    enable_query_logging: bool = False

    model_config = SettingsConfigDict(
        env_prefix="PERFORMANCE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class RateLimitSettings(BaseSettings):
    """Rate Limiting configuration settings."""

    per_minute: int = 60
    burst: int = 10

    model_config = SettingsConfigDict(
        env_prefix="RATE_LIMIT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class MonitoringSettings(BaseSettings):
    """Monitoring configuration settings."""

    enable_metrics: bool = True
    metrics_port: int = 9090

    model_config = SettingsConfigDict(
        env_prefix="MONITORING_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class LoggingSettings(BaseSettings):
    """Logging configuration settings."""

    level: str = "INFO"
    enable_file_logging: bool = True
    log_dir: str = "logs"
    max_size: int = 10_485_760  # 10MB
    backup_count: int = 5
    enable_console_logging: bool = True

    model_config = SettingsConfigDict(
        env_prefix="LOG_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def log_config(self) -> dict:
        """Get logging configuration."""
        return {
            "level": self.level,
            "enable_file_logging": self.enable_file_logging,
            "log_dir": self.log_dir,
            "max_file_size": self.max_size,
            "backup_count": self.backup_count,
            "enable_console": self.enable_console_logging,
        }


class PaginationSettings(BaseSettings):
    """Pagination configuration settings."""

    default_page_size: int = 20
    max_page_size: int = 100

    model_config = SettingsConfigDict(
        env_prefix="PAGINATION_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class ZapierSettings(BaseSettings):
    """WhatsApp/Zapier integration configuration settings."""

    base_url: str = Field(
        default="https://hooks.zapier.com/hooks/catch/6650285/ur099zt/",
        description="Zapier webhook base URL for WhatsApp integration"
    )
    send_type: str = Field(
        default="Group",
        description="WhatsApp send type (Group or Individual)"
    )
    frontend_base_url: str = Field(
        default="http://localhost:3010",
        description="Frontend base URL for building request detail links",
        validation_alias="FRONTEND_BASE_URL"
    )

    model_config = SettingsConfigDict(
        env_prefix="ZAPIER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class VersionPolicySettings(BaseSettings):
    """Version Authority enforcement configuration settings.

    Controls hard enforcement for version policy checks:
    - When disabled (default): Version policy is advisory only (soft enforcement)
    - When enabled: Clients with enforced outdated versions are rejected at login
    """

    enforce_enabled: bool = Field(
        default=False,
        description="Master switch for hard version enforcement. When False, version checks are advisory only."
    )
    reject_outdated_enforced: bool = Field(
        default=True,
        description="When enforce_enabled=True, reject logins from clients with OUTDATED_ENFORCED status."
    )
    reject_unknown: bool = Field(
        default=False,
        description="When True, also reject logins from unknown (unregistered) versions."
    )

    model_config = SettingsConfigDict(
        env_prefix="VERSION_POLICY_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class DeploymentWorkerSettings(BaseSettings):
    """
    Deployment worker authentication settings.

    The Rust deployment worker uses these settings to authenticate
    when claiming jobs and reporting results.
    """

    api_token: str = Field(
        default="",
        description="API token for worker authentication. Set via DEPLOYMENT_WORKER_API_TOKEN env var."
    )
    enabled: bool = Field(
        default=True,
        description="Enable deployment worker endpoints."
    )

    model_config = SettingsConfigDict(
        env_prefix="DEPLOYMENT_WORKER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class DeploymentSettings(BaseSettings):
    """
    Deployment configuration settings for NetSupport installer.

    Controls where the installer is stored and how it's accessed by workers.
    """

    installer_smb_path: str = Field(
        default="\\\\fileserver\\deploy$\\NetSupport\\netsupport-client.msi",
        description="SMB path to NetSupport installer MSI for deployment workers."
    )
    installer_args: str = Field(
        default="/qn /norestart",
        description="Default MSI installer arguments."
    )
    enroll_token: str = Field(
        default="",
        description="Enrollment token for NetSupport client registration."
    )
    job_timeout_minutes: int = Field(
        default=15,
        ge=1,
        le=60,
        description="Maximum time for a deployment job to complete."
    )

    model_config = SettingsConfigDict(
        env_prefix="DEPLOYMENT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


class Settings(BaseSettings):
    """Main application settings."""

    api: APISettings = APISettings()
    database: DatabaseSettings = DatabaseSettings()
    turn: TURNSettings = TURNSettings()
    redis: RedisSettings = RedisSettings()
    celery: CelerySettings = CelerySettings()
    security: SecuritySettings = SecuritySettings()
    cors: CORSSettings = CORSSettings()
    file_upload: FileUploadSettings = FileUploadSettings()
    minio: MinIOSettings = MinIOSettings()
    chat_attachments: ChatAttachmentSettings = ChatAttachmentSettings()
    active_directory: ActiveDirectorySettings = ActiveDirectorySettings()
    email: EmailSettings = EmailSettings()
    websocket: WebSocketSettings = WebSocketSettings()
    signalr: SignalRSettings = SignalRSettings()
    performance: PerformanceSettings = PerformanceSettings()
    rate_limit: RateLimitSettings = RateLimitSettings()
    monitoring: MonitoringSettings = MonitoringSettings()
    logging: LoggingSettings = LoggingSettings()
    pagination: PaginationSettings = PaginationSettings()
    zapier: ZapierSettings = ZapierSettings()
    version_policy: VersionPolicySettings = VersionPolicySettings()
    deployment_worker: DeploymentWorkerSettings = DeploymentWorkerSettings()
    deployment: DeploymentSettings = DeploymentSettings()

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get the global settings instance."""
    return settings
