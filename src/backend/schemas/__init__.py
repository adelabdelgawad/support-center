"""
Schemas package for API validation and serialization.

This package provides streamlined schemas that complement SQLModel functionality
without unnecessary duplication, focusing on API-specific needs.
"""
from .screenshot.screenshot import (
    ScreenshotBase,
    ScreenshotCreate,
    ScreenshotRead,
    ScreenshotUpdate,
    ScreenshotListItem,
)
from .auth import (AccessTokenData, AuthError, DeviceInfo, LoginRequest,
                   LoginResponse, LogoutResponse, SessionInfo, TokenData,
                   TokenIntrospectResponse, TokenMetadata, TokenPayload,
                   TokenResponse, TokenSettings, TokenValidationResponse)
from .business_unit import (BusinessUnitCreate, BusinessUnitRead,
                            BusinessUnitUpdate)
from .business_unit_region import (BusinessUnitRegionCreate,
                                   BusinessUnitRegionRead,
                                   BusinessUnitRegionUpdate)
from .business_unit_user_assign import (BusinessUnitUserAssignCreate,
                                        BusinessUnitUserAssignRead,
                                        BusinessUnitUserAssignUpdate)
from .category import (CategoryCreate, CategoryRead, CategoryUpdate,
                       CategoryWithSubcategories, SubcategoryCreate,
                       SubcategoryRead, SubcategoryUpdate)
from .chat_message.chat_message import (ChatMessageBase, ChatMessageCreate,
                                        ChatMessageCreateByClient,
                                        ChatMessageListItem, ChatMessageRead,
                                        ChatMessageReadUpdate,
                                        ChatMessageUpdate)
from .chat_message.chat_page import (ChatMessageCountRecord,
                                      ChatPageResponse, ChatRequestListItem,
                                      RequestStatusCount)
from .priority import (PriorityCreate, PriorityListItem, PriorityRead,
                       PriorityUpdate)
from .request_status.request_status import (RequestStatusBase,
                                            RequestStatusCreate,
                                            RequestStatusDetail,
                                            RequestStatusListItem,
                                            RequestStatusRead,
                                            RequestStatusSummary,
                                            RequestStatusUpdate)
from .service_request.service_request import (AssignTechnicianRequest,
                                              ServiceRequestBase,
                                              ServiceRequestCreate,
                                              ServiceRequestCreateByRequester,
                                              ServiceRequestDetailRead,
                                              ServiceRequestList,
                                              ServiceRequestListItem,
                                              ServiceRequestRead,
                                              ServiceRequestStats,
                                              ServiceRequestStatusUpdate,
                                              ServiceRequestUpdate,
                                              ServiceRequestUpdateByTechnician,
                                              SubTaskCreate)
from .request_note import (RequestNoteCreate,
                          RequestNoteDetail,
                          RequestNoteRead)
from .system_message import (SystemMessageBase, SystemMessageCreate,
                             SystemMessageRead, SystemMessageUpdate)
from .user.domain_user import DomainUser
from .user.user import (UserBase, UserBlockedResponse, UserBlockRequest,
                        UserCreate, UserDetail, UserListItem,
                        UserPasswordUpdate, UserProfileUpdate, UserRead,
                        UserStatus, UserUpdate, UserWithDetails)
from .remote_access import (
    RemoteAccessSessionDetail,
    RemoteAccessSessionList,
    RemoteAccessSessionRead,
)
from .version import (
    ClientVersionBase,
    ClientVersionCreate,
    ClientVersionListItem,
    ClientVersionRead,
    ClientVersionUpdate,
    VersionPolicyResult,
)

__all__ = [
    # User schemas
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserRead",
    "UserListItem",
    "UserDetail",
    "UserWithDetails",
    "UserProfileUpdate",
    "UserPasswordUpdate",
    "UserStatus",
    "UserBlockRequest",
    "UserBlockedResponse",
    "DomainUser",

    # Session schemas
    "SessionBase",
    "SessionCreate",
    "SessionUpdate",
    "SessionRead",
    "SessionSummary",
    "SessionHeartbeat",

    # System Message schemas
    "SystemMessageBase",
    "SystemMessageCreate",
    "SystemMessageUpdate",
    "SystemMessageRead",

    # Request Status schemas
    "RequestStatusBase",
    "RequestStatusCreate",
    "RequestStatusUpdate",
    "RequestStatusRead",
    "RequestStatusListItem",
    "RequestStatusDetail",
    "RequestStatusSummary",

    # Service Request schemas
    "ServiceRequestBase",
    "ServiceRequestCreate",
    "ServiceRequestCreateByRequester",
    "ServiceRequestUpdate",
    "ServiceRequestUpdateByTechnician",
    "ServiceRequestRead",
    "ServiceRequestDetailRead",
    "ServiceRequestListItem",
    "ServiceRequestList",
    "ServiceRequestStatusUpdate",
    "ServiceRequestStats",
    "AssignTechnicianRequest",

    # Chat Message schemas
    "ChatMessageBase",
    "ChatMessageCreate",
    "ChatMessageCreateByClient",
    "ChatMessageUpdate",
    "ChatMessageRead",
    "ChatMessageListItem",
    "ChatMessageReadUpdate",
    # REMOVED: "ChatMessageWithAttachmentsResponse" (attachments removed)

    # REMOVED: Chat Screenshot schemas (attachments removed)

    # Chat Page schemas
    "ChatPageResponse",
    "RequestStatusCount",
    "ChatMessageCountRecord",
    "ChatRequestListItem",

    # Screenshot schemas
    "ScreenshotBase",
    "ScreenshotCreate",
    "ScreenshotUpdate",
    "ScreenshotRead",
    "ScreenshotListItem",

    # Priority schemas
    "PriorityCreate",
    "PriorityUpdate",
    "PriorityRead",
    "PriorityListItem",

    # Category schemas
    "CategoryCreate",
    "CategoryUpdate",
    "CategoryRead",
    "CategoryWithSubcategories",
    "SubcategoryCreate",
    "SubcategoryUpdate",
    "SubcategoryRead",

    # Business Unit Region schemas
    "BusinessUnitRegionCreate",
    "BusinessUnitRegionUpdate",
    "BusinessUnitRegionRead",

    # Business Unit schemas
    "BusinessUnitCreate",
    "BusinessUnitUpdate",
    "BusinessUnitRead",

    # Business Unit User Assignment schemas
    "BusinessUnitUserAssignCreate",
    "BusinessUnitUserAssignUpdate",
    "BusinessUnitUserAssignRead",

    # Request Note schemas
    "RequestNoteCreate",
    "RequestNoteRead",
    "RequestNoteDetail",

    # Remote Access schemas (ephemeral sessions - minimal)
    "RemoteAccessSessionRead",
    "RemoteAccessSessionDetail",
    "RemoteAccessSessionList",

    # Authentication schemas
    "LoginRequest",
    "LoginResponse",
    "TokenResponse",
    "TokenData",
    "DeviceInfo",
    "SessionInfo",
    "LogoutResponse",
    "AuthError",
    "TokenValidationResponse",
    "TokenPayload",
    "AccessTokenData",
    "TokenMetadata",
    "TokenIntrospectResponse",
    "TokenSettings",

    # Client Version schemas
    "ClientVersionBase",
    "ClientVersionCreate",
    "ClientVersionUpdate",
    "ClientVersionRead",
    "ClientVersionListItem",
    "VersionPolicyResult",
]
