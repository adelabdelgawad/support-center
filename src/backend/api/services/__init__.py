"""
Business logic services with performance optimizations.

This module provides backward-compatible imports for services that have been
organized into domain-based subdirectories (setting/, support/, management/).

For new code, prefer importing directly from the domain subdirectories:
- from api.services.setting import UserService, RoleService, PageService
- from api.services.support import RequestService, ChatService, ScreenshotService
- from api.services.management import DesktopSessionService, DeviceService
"""

# Backward-compatible re-exports for commonly used services
from .setting.user_service import UserService
from .support.request_service import RequestService
from .support.chat_service import ChatService
from .support.file_service import FileService

# Infrastructure services (kept at root level)
from .auth_service import AuthenticationService
from .audit_service import AuditService
from .active_directory import ActiveDirectoryService, LdapService
from .minio_service import MinIOStorageService
from .signalr_client import signalr_client
from .presence_service import PresenceRedisService
from .whatsapp_sender import WhatsAppSender
from .event_publisher import RedisStreamsPublisher
from .reporting_service import ReportingService
from .report_config_service import ReportConfigService
from .outshift_reporting_service import OutshiftReportingService
from .web_session_service import WebSessionService
from .version_policy_service import VersionPolicyService, VersionStatus
from .credential_service import CredentialService

__all__ = [
    # Backward-compatible exports
    "UserService",
    "RequestService",
    "ChatService",
    "FileService",
    # Infrastructure services
    "AuthenticationService",
    "AuditService",
    "ActiveDirectoryService",
    "LdapService",
    "MinioService",
    "signalr_client",
    "PresenceService",
    "WhatsAppSender",
    "EventPublisher",
    "ReportingService",
    "ReportConfigService",
    "OutshiftReportingService",
    "WebSessionService",
    "VersionPolicyService",
    "VersionStatus",
    "CredentialService",
]
