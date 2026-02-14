# Audit Trail System - Comprehensive Design Document

## 1. Overview

### Problem
The application has no persistent audit trail for user actions. Status changes are only recorded as system chat messages, and all other changes (assignments, priority, category, section, etc.) are broadcast via SignalR in real-time but never persisted to the database.

### Solution
Activate the existing dormant audit infrastructure and add a **FastAPI middleware** that automatically intercepts all mutation requests (POST/PUT/PATCH/DELETE), maps them to resource types and actions via a configuration registry, and creates audit log entries in a background task with an isolated DB session. Build a frontend admin page with a data table, filters, and detail view.

### Key Design Decision
Instead of manually adding audit calls to 131+ endpoints (error-prone, high maintenance), use middleware-based automatic capture for 100% coverage with zero changes to existing endpoint code.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (Browser / Desktop App)               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP Request (POST/PUT/PATCH/DELETE)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FastAPI Middleware Stack                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ CorrelationIdMiddleware  (sets correlation_id ContextVar)   │    │
│  └────────────────────────────┬────────────────────────────────┘    │
│  ┌────────────────────────────▼────────────────────────────────┐    │
│  │ AuditMiddleware                                              │    │
│  │  1. Check if mutation method (POST/PUT/PATCH/DELETE)         │    │
│  │  2. Skip non-auditable routes (health, heartbeats, etc.)    │    │
│  │  3. Resolve route → (resource_type, action, resource_id)    │    │
│  │  4. Execute endpoint via call_next(request)                  │    │
│  │  5. On 2xx response: fire-and-forget audit log creation     │    │
│  └────────────────────────────┬────────────────────────────────┘    │
│                               ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Endpoint (existing, unchanged)                               │    │
│  │  - For enriched audit: sets audit_handled_var = True         │    │
│  │  - Creates detailed audit with old/new values                │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼ asyncio.create_task (fire-and-forget)
┌─────────────────────────────────────────────────────────────────────┐
│ AuditService.create_audit_log_background()                          │
│  - Uses isolated AsyncSessionLocal (not endpoint's transaction)     │
│  - Writes to audit_logs table                                       │
│  - try/except: failures never propagate to endpoint                 │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PostgreSQL: audit_logs table                                        │
│  - Indexed on: user_id, action, resource_type, resource_id,        │
│    correlation_id, created_at, composite (user+action+resource)     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

**Automatic (Middleware):**
1. Every mutation request passes through `AuditMiddleware`
2. URL pattern matched against `audit_config.py` route registry
3. User ID extracted from JWT token (no DB query)
4. IP, user-agent, correlation ID captured from request context
5. On successful response: background task creates audit entry

**Enriched (Explicit):**
1. Specific endpoints (e.g., request update) snapshot old values before mutation
2. After mutation, create enriched audit entry with old/new values
3. Set `audit_handled_var` ContextVar to prevent middleware duplicate

---

## 3. Existing Dormant Infrastructure

The following infrastructure exists but is completely unused (the `@audit_operation` decorator is never applied to any function):

| Component | File | Status |
|-----------|------|--------|
| `Audit` model | `src/backend/db/models.py:5453` | Exists, NOT exported from `db/__init__.py` |
| `AuditService` | `src/backend/api/services/audit_service.py` | Exists, never called |
| `AuditCreate` schema | `src/backend/api/schemas/audit.py` | Exists, inherits HTTPSchemaModel |
| `AuditRead` schema | `src/backend/api/schemas/audit.py` | Exists |
| `AuditFilter` schema | `src/backend/api/schemas/audit.py` | Exists |
| `@audit_operation` decorator | `src/backend/core/audit_decorator.py` | Exists, never used |
| `GET /audit` endpoint | `src/backend/api/routers/auth/audit_router.py` | Exists, registered, super_admin only |

### Audit Model Schema (audit_logs table)

```
audit_logs
├── id              INT (PK, auto-increment)
├── user_id         UUID (FK → users.id, nullable)
├── action          VARCHAR(100) (NOT NULL) -- e.g., "CREATE", "UPDATE", "DELETE"
├── resource_type   VARCHAR(100) (NOT NULL) -- e.g., "ServiceRequest", "User"
├── resource_id     VARCHAR(255) (nullable) -- ID of the affected resource
├── old_values      JSON (nullable) -- Snapshot before change
├── new_values      JSON (nullable) -- Snapshot after change
├── ip_address      VARCHAR(45) (nullable) -- Client IP (IPv4/IPv6)
├── endpoint        VARCHAR(255) (nullable) -- e.g., "PATCH /backend/requests/42"
├── correlation_id  VARCHAR(36) (nullable) -- Request tracing UUID
├── user_agent      VARCHAR(500) (nullable) -- Browser/client user agent
├── changes_summary VARCHAR(1000) (nullable) -- Human-readable summary
├── created_at      TIMESTAMP (default: CURRENT_TIMESTAMP)
│
├── INDEX ix_audit_logs_user_id (user_id)
├── INDEX ix_audit_logs_action (action)
├── INDEX ix_audit_logs_resource_type (resource_type)
├── INDEX ix_audit_logs_resource_id (resource_id)
├── INDEX ix_audit_logs_correlation_id (correlation_id)
├── INDEX ix_audit_logs_created_at (created_at)
└── INDEX ix_audit_logs_user_action_resource (user_id, action, resource_type)
```

---

## 4. Trackable Actions Registry (131 Actions)

### 4.1 Authentication (7 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 1 | Passwordless login | POST | `/auth/login` | Authentication | LOGIN |
| 2 | SSO login | POST | `/auth/sso-login` | Authentication | SSO_LOGIN |
| 3 | AD login | POST | `/auth/ad-login` | Authentication | AD_LOGIN |
| 4 | Admin login | POST | `/auth/admin-login` | Authentication | ADMIN_LOGIN |
| 5 | Logout | POST | `/auth/logout` | Authentication | LOGOUT |
| 6 | Terminate session | DELETE | `/auth/sessions/{session_id}` | Session | TERMINATE |
| 7 | Terminate all sessions | DELETE | `/auth/sessions` | Session | TERMINATE_ALL |

**Service file:** `src/backend/api/services/auth_service.py`
**Endpoint file:** `src/backend/api/routers/auth/login_router.py`

### 4.2 Service Requests (13 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 8 | Create request | POST | `/requests` | ServiceRequest | CREATE |
| 9 | Create request (by requester) | POST | `/requests/requester` | ServiceRequest | CREATE_BY_REQUESTER |
| 10 | Update request (supervisor) | PATCH | `/requests/{id}` | ServiceRequest | UPDATE |
| 11 | Update request (technician) | PATCH | `/requests/{id}/technician-update` | ServiceRequest | TECHNICIAN_UPDATE |
| 12 | Delete request | DELETE | `/requests/{id}` | ServiceRequest | DELETE |
| 13 | Bulk update requests | PATCH | `/requests/bulk` | ServiceRequest | BULK_UPDATE |
| 14 | Reassign section | PATCH | `/requests/{id}/reassign-section` | ServiceRequest | REASSIGN_SECTION |
| 15 | Create sub-task | POST | `/requests/{parent_id}/sub-tasks` | SubTask | CREATE |
| 16 | Reorder sub-tasks | POST | `/requests/{parent_id}/sub-tasks/reorder` | SubTask | REORDER |
| 17 | Link screenshot | POST | `/requests/{id}/screenshots/{sid}/link` | ServiceRequest | LINK_SCREENSHOT |
| 18 | Unlink screenshot | DELETE | `/requests/{id}/screenshots/{sid}/link` | ServiceRequest | UNLINK_SCREENSHOT |
| 19 | Assign technician | POST | `/requests/{id}/assign` | ServiceRequest | ASSIGN_TECHNICIAN |
| 20 | Unassign technician | POST | `/requests/{id}/unassign` | ServiceRequest | UNASSIGN_TECHNICIAN |

**Service file:** `src/backend/api/services/request_service.py`
**Endpoint file:** `src/backend/api/routers/support/requests_router.py`

### 4.3 Chat & Communication (8 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 21 | Send chat message | POST | `/chat/messages` | ChatMessage | SEND |
| 22 | Delete chat message | DELETE | `/chat/messages/{id}` | ChatMessage | DELETE |
| 23 | Mark message read | POST | `/chat/messages/{id}/read` | ChatMessage | MARK_READ |
| 24 | Mark all messages read | POST | `/chat/messages/request/{id}/read-all` | ChatMessage | MARK_ALL_READ |
| 25 | Mark chat read | POST | `/chat/{id}/mark-read` | Chat | MARK_READ |
| 26 | Upload screenshot | POST | `/screenshots/upload` | Screenshot | UPLOAD |
| 27 | Bulk upload screenshots | POST | `/screenshots/bulk-upload` | Screenshot | BULK_UPLOAD |
| 28 | Delete screenshot | DELETE | `/screenshots/{id}` | Screenshot | DELETE |

**Service file:** `src/backend/api/services/chat_service.py`
**Endpoint file:** `src/backend/api/routers/support/chat_router.py`

### 4.4 Chat Files (2 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 29 | Upload chat file | POST | `/chat-files/upload` | ChatFile | UPLOAD |
| 30 | Delete chat file | DELETE | `/chat-files/{file_id}` | ChatFile | DELETE |

**Endpoint file:** `src/backend/api/routers/support/chat_files_router.py`

### 4.5 Request Notes (1 action)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 31 | Create note | POST | `/request-notes` | RequestNote | CREATE |

**Service file:** `src/backend/api/services/request_note_service.py`
**Endpoint file:** `src/backend/api/routers/support/request_notes_router.py`

### 4.6 User Management (11 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 32 | Create user | POST | `/users` | User | CREATE |
| 33 | Update user | PATCH | `/users/{id}` | User | UPDATE |
| 34 | Delete user | DELETE | `/users/{id}` | User | DELETE |
| 35 | Block/unblock user | PATCH | `/users/{id}/block` | User | BLOCK |
| 36 | Update user status | PUT | `/users/{id}/status` | User | UPDATE_STATUS |
| 37 | Update technician flag | PUT | `/users/{id}/technician` | User | UPDATE_TECHNICIAN_FLAG |
| 38 | Update user roles | PUT | `/users/{id}/roles` | User | UPDATE_ROLES |
| 39 | Update user preferences | PATCH | `/users/{id}/preferences` | User | UPDATE_PREFERENCES |
| 40 | Bulk update user status | POST | `/users/bulk-status` | User | BULK_UPDATE_STATUS |
| 41 | Bulk update technician flag | POST | `/users/bulk-technician` | User | BULK_UPDATE_TECHNICIAN |
| 42 | Update custom view | PUT | `/user-custom-views` | UserCustomView | UPDATE |

**Service file:** `src/backend/api/services/user_service.py`
**Endpoint file:** `src/backend/api/routers/setting/users_router.py`

### 4.7 Roles & Permissions (6 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 43 | Create role | POST | `/roles` | Role | CREATE |
| 44 | Update role | PUT | `/roles/{id}` | Role | UPDATE |
| 45 | Toggle role status | PUT | `/roles/{id}/status` | Role | UPDATE_STATUS |
| 46 | Delete role | DELETE | `/roles/{id}` | Role | DELETE |
| 47 | Update role pages | PUT | `/roles/{id}/pages` | Role | UPDATE_PAGES |
| 48 | Update role users | PUT | `/roles/{id}/users` | Role | UPDATE_USERS |

**Endpoint file:** `src/backend/api/routers/setting/roles_router.py`

### 4.8 Categories & Subcategories (8 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 49 | Create category | POST | `/categories` | Category | CREATE |
| 50 | Update category | PUT | `/categories/{id}` | Category | UPDATE |
| 51 | Delete category | DELETE | `/categories/{id}` | Category | DELETE |
| 52 | Create subcategory | POST | `/categories/{id}/subcategories` | Subcategory | CREATE |
| 53 | Create subcategory (direct) | POST | `/subcategories` | Subcategory | CREATE |
| 54 | Update subcategory | PUT | `/subcategories/{id}` | Subcategory | UPDATE |
| 55 | Delete subcategory | DELETE | `/subcategories/{id}` | Subcategory | DELETE |
| 56 | Update category sections | Various | `/categories/.../sections` | Category | UPDATE_SECTIONS |

**Endpoint file:** `src/backend/api/routers/setting/categories_router.py`

### 4.9 Request Statuses (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 57 | Create status | POST | `/request-statuses` | RequestStatus | CREATE |
| 58 | Update status | PUT | `/request-statuses/{id}` | RequestStatus | UPDATE |
| 59 | Toggle status | PUT | `/request-statuses/{id}/status` | RequestStatus | UPDATE_STATUS |
| 60 | Bulk update statuses | POST | `/request-statuses/bulk-status` | RequestStatus | BULK_UPDATE_STATUS |
| 61 | Delete status | DELETE | `/request-statuses/{id}` | RequestStatus | DELETE |

**Endpoint file:** `src/backend/api/routers/setting/request_status_router.py`

### 4.10 Request Types (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 62 | Create type | POST | `/request-types` | RequestType | CREATE |
| 63 | Update type | PUT | `/request-types/{id}` | RequestType | UPDATE |
| 64 | Toggle type status | PUT | `/request-types/{id}/status` | RequestType | UPDATE_STATUS |
| 65 | Bulk update types | POST | `/request-types/bulk-status` | RequestType | BULK_UPDATE_STATUS |
| 66 | Delete type | DELETE | `/request-types/{id}` | RequestType | DELETE |

**Endpoint file:** `src/backend/api/routers/setting/request_types_router.py`

### 4.11 Priorities (3 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 67 | Create priority | POST | `/priorities` | Priority | CREATE |
| 68 | Update priority | PUT | `/priorities/{id}` | Priority | UPDATE |
| 69 | Delete priority | DELETE | `/priorities/{id}` | Priority | DELETE |

**Endpoint file:** `src/backend/api/routers/setting/priorities_router.py`

### 4.12 Business Units (6 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 70 | Create business unit | POST | `/business-units` | BusinessUnit | CREATE |
| 71 | Update business unit | PUT | `/business-units/{id}` | BusinessUnit | UPDATE |
| 72 | Toggle BU status | PUT | `/business-units/{id}/status` | BusinessUnit | UPDATE_STATUS |
| 73 | Update working hours | PATCH | `/business-units/{id}/working-hours` | BusinessUnit | UPDATE_WORKING_HOURS |
| 74 | Bulk update BU status | POST | `/business-units/bulk-status` | BusinessUnit | BULK_UPDATE_STATUS |
| 75 | Delete business unit | DELETE | `/business-units/{id}` | BusinessUnit | DELETE |

**Endpoint file:** `src/backend/api/routers/setting/business_units_router.py`

### 4.13 Business Unit Regions (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 76 | Create region | POST | `/business-unit-regions` | BusinessUnitRegion | CREATE |
| 77 | Update region | PUT | `/business-unit-regions/{id}` | BusinessUnitRegion | UPDATE |
| 78 | Toggle region status | PUT | `/business-unit-regions/{id}/status` | BusinessUnitRegion | UPDATE_STATUS |
| 79 | Bulk update region status | POST | `/business-unit-regions/bulk-status` | BusinessUnitRegion | BULK_UPDATE_STATUS |
| 80 | Delete region | DELETE | `/business-unit-regions/{id}` | BusinessUnitRegion | DELETE |

**Endpoint file:** `src/backend/api/routers/setting/business_unit_regions_router.py`

### 4.14 Technician Assignments (7 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 81 | Create assignment | POST | `/business-unit-user-assigns` | TechnicianAssignment | CREATE |
| 82 | Update assignment | PUT | `/business-unit-user-assigns/{id}` | TechnicianAssignment | UPDATE |
| 83 | Toggle assignment status | PUT | `/business-unit-user-assigns/{id}/status` | TechnicianAssignment | UPDATE_STATUS |
| 84 | Delete assignment | DELETE | `/business-unit-user-assigns/{id}` | TechnicianAssignment | DELETE |
| 85 | Bulk assign users | POST | `/business-unit-user-assigns/bulk-assign` | TechnicianAssignment | BULK_ASSIGN |
| 86 | Bulk remove users | POST | `/business-unit-user-assigns/bulk-remove` | TechnicianAssignment | BULK_REMOVE |

**Endpoint file:** `src/backend/api/routers/setting/business_unit_user_assigns_router.py`

### 4.15 Email Configuration (4 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 87 | Create email config | POST | `/email-configs` | EmailConfig | CREATE |
| 88 | Update email config | PUT | `/email-configs/{id}` | EmailConfig | UPDATE |
| 89 | Delete email config | DELETE | `/email-configs/{id}` | EmailConfig | DELETE |
| 90 | Test email connection | POST | `/email-configs/{id}/test` | EmailConfig | TEST |

**Endpoint file:** `src/backend/api/routers/setting/email_config_router.py`

### 4.16 Active Directory Configuration (4 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 91 | Create AD config | POST | `/ad-configs` | ADConfig | CREATE |
| 92 | Update AD config | PUT | `/ad-configs/{id}` | ADConfig | UPDATE |
| 93 | Delete AD config | DELETE | `/ad-configs/{id}` | ADConfig | DELETE |
| 94 | Test AD connection | POST | `/ad-configs/{id}/test` | ADConfig | TEST |

**Endpoint file:** `src/backend/api/routers/setting/active_directory_config_router.py`

### 4.17 SLA Configuration (3 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 95 | Create SLA config | POST | `/sla-configs` | SLAConfig | CREATE |
| 96 | Update SLA config | PATCH | `/sla-configs/{id}` | SLAConfig | UPDATE |
| 97 | Delete SLA config | DELETE | `/sla-configs/{id}` | SLAConfig | DELETE |

**Endpoint file:** `src/backend/api/routers/setting/sla_configs_router.py`

### 4.18 Report Configuration (3 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 98 | Create report config | POST | `/report-configs` | ReportConfig | CREATE |
| 99 | Update report config | PATCH | `/report-configs/{id}` | ReportConfig | UPDATE |
| 100 | Delete report config | DELETE | `/report-configs/{id}` | ReportConfig | DELETE |

**Endpoint file:** `src/backend/api/routers/reporting/report_configs_router.py`

### 4.19 Remote Access (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 101 | Request remote access | POST | `/requests/{id}/remote-access/request` | RemoteAccess | REQUEST |
| 102 | Start remote by user | POST | `/remote-access/start-by-user/{user_id}` | RemoteAccess | START_BY_USER |
| 103 | End remote session | POST | `/remote-access/{id}/end` | RemoteAccess | END |
| 104 | Toggle control mode | POST | `/remote-access/{id}/control` | RemoteAccess | TOGGLE_CONTROL |
| 105 | Resume remote session | POST | `/remote-access/{id}/resume` | RemoteAccess | RESUME |

**Endpoint file:** `src/backend/api/routers/management/remote_access_router.py`

### 4.20 Desktop Sessions (3 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 106 | Disconnect session | POST | `/desktop-sessions/{id}/disconnect` | DesktopSession | DISCONNECT |
| 107 | Push update | POST | `/desktop-sessions/{id}/push-update` | DesktopSession | PUSH_UPDATE |
| 108 | Cleanup stale sessions | POST | `/desktop-sessions/cleanup` | DesktopSession | CLEANUP |

**Endpoint file:** `src/backend/api/routers/management/desktop_sessions_router.py`

### 4.21 Scheduler (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 109 | Create scheduled job | POST | `/scheduler/jobs` | ScheduledJob | CREATE |
| 110 | Update scheduled job | PUT | `/scheduler/jobs/{id}` | ScheduledJob | UPDATE |
| 111 | Delete scheduled job | DELETE | `/scheduler/jobs/{id}` | ScheduledJob | DELETE |
| 112 | Toggle job status | PUT | `/scheduler/jobs/{id}/status` | ScheduledJob | UPDATE_STATUS |
| 113 | Trigger job manually | POST | `/scheduler/jobs/{id}/trigger` | ScheduledJob | TRIGGER |

**Endpoint file:** `src/backend/api/routers/management/scheduler_router.py`

### 4.22 Devices (7 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 114 | Update device | PUT | `/devices/{id}` | Device | UPDATE |
| 115 | Add device manually | POST | `/devices/manual` | Device | CREATE |
| 116 | Discover from AD | POST | `/devices/discover-ad` | Device | DISCOVER_AD |
| 117 | Sync from sessions | POST | `/devices/sync-sessions` | Device | SYNC_SESSIONS |
| 118 | Network scan | POST | `/devices/network-scan` | Device | NETWORK_SCAN |
| 119 | Refresh device status | POST | `/devices/refresh-status` | Device | REFRESH_STATUS |
| 120 | Trigger install | POST | `/devices/{id}/install` | Device | INSTALL |

**Endpoint file:** `src/backend/api/routers/management/devices_router.py`

### 4.23 Deployment Jobs (2 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 121 | Create deployment job | POST | `/deployment-jobs` | DeploymentJob | CREATE |
| 122 | Report job result | POST | `/internal/deployment-jobs/{id}/result` | DeploymentJob | UPDATE_RESULT |

**Endpoint file:** `src/backend/api/routers/management/deployment_jobs_router.py`

### 4.24 Client Versions (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 123 | Create version | POST | `/client-versions` | ClientVersion | CREATE |
| 124 | Update version | PUT | `/client-versions/{id}` | ClientVersion | UPDATE |
| 125 | Set as latest | POST | `/client-versions/{id}/set-latest` | ClientVersion | SET_LATEST |
| 126 | Delete version | DELETE | `/client-versions/{id}` | ClientVersion | DELETE |
| 127 | Upload installer | POST | `/client-versions/{id}/installer` | ClientVersion | UPLOAD_INSTALLER |

**Endpoint file:** `src/backend/api/routers/management/client_versions_router.py`

### 4.25 System Events (4 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 128 | Create system event | POST | `/system-events` | SystemEvent | CREATE |
| 129 | Update system event | PATCH | `/system-events/{id}` | SystemEvent | UPDATE |
| 130 | Toggle system event | PATCH | `/system-events/{id}/toggle` | SystemEvent | TOGGLE |
| 131 | Delete system event | DELETE | `/system-events/{id}` | SystemEvent | DELETE |

**Endpoint file:** `src/backend/api/routers/management/system_events_router.py`

### 4.26 System Messages (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 132 | Create system message | POST | `/system-messages` | SystemMessage | CREATE |
| 133 | Update system message | PATCH | `/system-messages/{id}` | SystemMessage | UPDATE |
| 134 | Toggle system message | PATCH | `/system-messages/{id}/toggle` | SystemMessage | TOGGLE |
| 135 | Bulk update status | POST | `/system-messages/bulk-status` | SystemMessage | BULK_UPDATE_STATUS |
| 136 | Delete system message | DELETE | `/system-messages/{id}` | SystemMessage | DELETE |

**Endpoint file:** `src/backend/api/routers/setting/system_messages_router.py`

### 4.27 Organizational Units (5 actions)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 137 | Create OU | POST | `/organizational-units` | OrganizationalUnit | CREATE |
| 138 | Update OU | PATCH | `/organizational-units/{id}` | OrganizationalUnit | UPDATE |
| 139 | Delete OU | DELETE | `/organizational-units/{id}` | OrganizationalUnit | DELETE |
| 140 | Toggle OU enabled | POST | `/organizational-units/{id}/toggle` | OrganizationalUnit | TOGGLE |
| 141 | Sync OUs from AD | POST | `/organizational-units/sync` | OrganizationalUnit | SYNC |

**Endpoint file:** `src/backend/api/routers/setting/organizational_units_router.py`

### 4.28 Domain Users (1 action)

| # | Action | HTTP | Endpoint | resource_type | action |
|---|--------|------|----------|--------------|--------|
| 142 | Sync domain users | POST | `/domain-users/sync` | DomainUser | SYNC |

**Endpoint file:** `src/backend/api/routers/setting/domain_users_router.py`

### Skipped Routes (High-Frequency / Low-Value)

These are explicitly excluded from audit logging:

| Route | Reason |
|-------|--------|
| `POST /desktop-sessions/{id}/heartbeat` | Every 30 seconds per user, floods table |
| `POST /remote-access/{id}/heartbeat` | High frequency during active sessions |
| `POST /chat/messages/{id}/read` | Too frequent, reading messages |
| `POST /chat/messages/request/{id}/read-all` | Batch read marks |
| `POST /chat/{id}/mark-read` | Chat-level read marks |
| `POST /auth/refresh` | Token refresh, automated, no user action |
| `GET *` | All read operations (audit tracks mutations only) |
| `/health`, `/metrics`, `/ws/*` | Infrastructure endpoints |
| `/api/docs`, `/api/redoc`, `/api/openapi.json` | Documentation endpoints |

---

## 5. Route-Action Configuration Design

**New file:** `src/backend/core/audit_config.py`

### Data Structure

```python
@dataclass
class AuditRouteConfig:
    method: str              # HTTP method: POST, PUT, PATCH, DELETE
    pattern: re.Pattern      # Compiled regex for the URL path
    resource_type: str       # Resource type for the audit log
    action: str              # Action name for the audit log
    id_group: int = 1        # Regex group index for extracting resource_id (0 = no ID)
```

### Skip Prefixes

```python
AUDIT_SKIP_PREFIXES = [
    "/health",
    "/metrics",
    "/ws",
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
]

AUDIT_SKIP_ROUTES = [
    ("POST", r"/backend/auth/refresh"),
    ("POST", r"/backend/desktop-sessions/[^/]+/heartbeat"),
    ("POST", r"/backend/remote-access/[^/]+/heartbeat"),
    ("POST", r"/backend/chat/messages/[^/]+/read$"),
    ("POST", r"/backend/chat/messages/request/[^/]+/read-all"),
    ("POST", r"/backend/chat/[^/]+/mark-read"),
]
```

### De-duplication ContextVar

```python
from contextvars import ContextVar
audit_handled_var: ContextVar[bool] = ContextVar("audit_handled", default=False)
```

When an enriched audit is created in the service/endpoint layer, set `audit_handled_var.set(True)`. The middleware checks this and skips creating a basic entry, preventing duplicates.

### Resolver Function

```python
def resolve_route(method: str, path: str) -> Optional[Tuple[str, str, Optional[str]]]:
    """
    Match a request to an audit route config.
    Returns: (resource_type, action, resource_id) or None if no match/skipped.
    """
    for config in AUDIT_ROUTES:
        if config.method != method:
            continue
        match = config.pattern.match(path)
        if match:
            resource_id = match.group(config.id_group) if config.id_group > 0 and match.lastindex else None
            return (config.resource_type, config.action, resource_id)
    return None
```

---

## 6. Audit Middleware Design

**New file:** `src/backend/core/middleware/audit.py`

### Middleware Class

```python
class AuditMiddleware(BaseHTTPMiddleware):
    """
    Automatically creates audit log entries for all mutation requests.

    - Intercepts POST, PUT, PATCH, DELETE requests
    - Maps URL to resource_type/action via audit_config
    - Extracts user_id from JWT (no DB query)
    - Creates audit entry in background task with isolated DB session
    - Never blocks or fails the actual request
    """

    MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
```

### Middleware Flow

```
Request arrives
    │
    ▼
Is mutation method? ──No──► call_next(request) (pass through)
    │ Yes
    ▼
Is skipped prefix? ──Yes──► call_next(request) (pass through)
    │ No
    ▼
resolve_route(method, path) ──None──► call_next(request) (no config)
    │ Returns (resource_type, action, resource_id)
    ▼
response = call_next(request)
    │
    ▼
Is 2xx response? ──No──► return response (don't audit failures)
    │ Yes
    ▼
Is audit_handled_var True? ──Yes──► return response (enriched audit already created)
    │ No
    ▼
Extract user_id from JWT (decode_token, no DB)
Extract ip_address (get_client_ip)
Extract correlation_id (get_correlation_id)
Extract user_agent from headers
    │
    ▼
asyncio.create_task(
    AuditService.create_audit_log_background(AuditCreate(...))
)
    │
    ▼
return response
```

### User ID Extraction (No DB Query)

```python
def _extract_user_id(self, request: Request) -> Optional[UUID]:
    """Extract user_id from JWT without DB query."""
    try:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None
        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)  # from core.security
        sub = payload.get("sub")
        return UUID(sub) if sub else None
    except Exception:
        return None  # Graceful fallback for auth endpoints
```

### Registration in Factory

**File:** `src/backend/core/factory.py`

```python
# Add BEFORE CorrelationIdMiddleware (Starlette LIFO execution order)
# This ensures CorrelationId runs first, setting the ContextVar
app.add_middleware(AuditMiddleware)
app.add_middleware(CorrelationIdMiddleware)  # existing
```

Starlette middleware execution order is LIFO: the last middleware added runs first on the request. Since `CorrelationIdMiddleware` is added after `AuditMiddleware`, it executes first (setting the correlation_id), then `AuditMiddleware` runs with the correlation_id available.

---

## 7. AuditService Enhancements

**File:** `src/backend/api/services/audit_service.py`

### New: Background Audit Creation (Isolated Session)

```python
@staticmethod
async def create_audit_log_background(audit_data: AuditCreate) -> None:
    """Fire-and-forget audit log creation with independent DB session."""
    from db.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            audit = Audit(**audit_data.model_dump())
            session.add(audit)
            await session.commit()
    except Exception as e:
        logger.error(f"Background audit log failed: {e}")
        # Never propagate - audit failures must not affect endpoints
```

### New: Filter Option Methods

```python
@staticmethod
async def get_distinct_actions(session: AsyncSession) -> List[str]:
    result = await session.execute(
        select(func.distinct(Audit.action)).order_by(Audit.action)
    )
    return [row[0] for row in result.all()]

@staticmethod
async def get_distinct_resource_types(session: AsyncSession) -> List[str]:
    result = await session.execute(
        select(func.distinct(Audit.resource_type)).order_by(Audit.resource_type)
    )
    return [row[0] for row in result.all()]

@staticmethod
async def get_distinct_users(session: AsyncSession) -> List[dict]:
    result = await session.execute(
        select(Audit.user_id, User.username, User.full_name)
        .join(User, Audit.user_id == User.id)
        .distinct()
        .order_by(User.full_name)
    )
    return [
        {"user_id": str(row.user_id), "username": row.username, "full_name": row.full_name}
        for row in result.all()
    ]
```

### Enhanced: Search Filter

Add to `get_audit_logs()`:

```python
if filters.search:
    search_term = f"%{filters.search}%"
    query = query.where(
        or_(
            Audit.changes_summary.ilike(search_term),
            Audit.endpoint.ilike(search_term),
            Audit.resource_id.ilike(search_term),
            User.username.ilike(search_term),
            User.full_name.ilike(search_term),
        )
    )
```

---

## 8. Schema Enhancements

**File:** `src/backend/api/schemas/audit.py`

### Updated AuditFilter

```python
class AuditFilter(HTTPSchemaModel):
    user_id: Optional[UUID] = None
    action: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    correlation_id: Optional[str] = None
    search: Optional[str] = Field(None, max_length=200)  # NEW
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    page: int = Field(1, ge=1)
    per_page: int = Field(20, ge=1, le=100)
```

### New Schemas

```python
class AuditUserOption(HTTPSchemaModel):
    user_id: UUID
    username: str
    full_name: Optional[str]

class AuditFilterOptions(HTTPSchemaModel):
    actions: List[str]
    resource_types: List[str]
    users: List[AuditUserOption]
```

---

## 9. Backend API Endpoints

**File:** `src/backend/api/routers/auth/audit_router.py`

### Existing: GET /audit (Enhanced)

Query params added:
- `search: str | None` - text search across summary, endpoint, username
- `start_date: datetime | None` - filter from date
- `end_date: datetime | None` - filter to date

### New: GET /audit/filter-options

```python
@router.get("/filter-options")
async def get_audit_filter_options(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_super_admin),
):
    """Get distinct values for filter dropdowns."""
    actions = await AuditService.get_distinct_actions(session)
    resource_types = await AuditService.get_distinct_resource_types(session)
    users = await AuditService.get_distinct_users(session)
    return {
        "actions": actions,
        "resource_types": resource_types,
        "users": users,
    }
```

---

## 10. Frontend: Audit Logs Page

### Page Location

`/admin/management/audit-logs` - Super admin only

### File Structure

```
src/it-app/app/(it-pages)/admin/(admin-pages)/management/audit-logs/
├── page.tsx                                    # Server component (SSR)
└── _components/
    ├── audit-table.tsx                         # Main client table
    ├── audit-table-columns.tsx                 # Column definitions
    └── audit-detail-sheet.tsx                  # Detail view (Sheet)
```

### Supporting Files

```
src/it-app/
├── types/audit.d.ts                            # TypeScript types
├── lib/actions/audit.actions.ts                # Server actions (SSR fetch)
├── app/api/audit/route.ts                      # API route proxy
├── app/api/audit/filter-options/route.ts       # Filter options proxy
└── lib/config/navigation-sections.ts           # Navigation (add entry)
```

### TypeScript Types

```typescript
interface AuditLog {
  id: number;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  endpoint: string | null;
  correlationId: string | null;
  userAgent: string | null;
  changesSummary: string | null;
  createdAt: string;
  username: string | null;
  userFullName: string | null;
}

interface AuditLogsResponse {
  data: AuditLog[];
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    totalPages: number;
  };
}

interface AuditFilterOptions {
  actions: string[];
  resourceTypes: string[];
  users: Array<{
    userId: string;
    username: string;
    fullName: string | null;
  }>;
}
```

### Page Component (SSR)

Follows the `active-sessions/page.tsx` pattern:

```typescript
export default async function AuditLogsPage({ searchParams }) {
  const params = await searchParams;

  const [_, session, auditData, filterOptions] = await Promise.all([
    validateAgentAccess(),
    auth(),
    getAuditLogs({ page, perPage, action, resourceType, userId, search, startDate, endDate }),
    getAuditFilterOptions(),
  ]);

  return <AuditTable initialData={auditData} filterOptions={filterOptions} />;
}
```

### Data Table Columns

| Column | Field | Rendering |
|--------|-------|-----------|
| Timestamp | `createdAt` | Relative time (e.g., "2m ago") + tooltip with full datetime |
| User | `username` / `userFullName` | Full name as primary, username as subtitle |
| Action | `action` | Color-coded badge: CREATE=green, UPDATE=blue, DELETE=red, LOGIN=purple, ASSIGN=orange |
| Resource | `resourceType` | Badge with resource type label |
| Resource ID | `resourceId` | Monospace font, truncated with tooltip for full value |
| Summary | `changesSummary` | Truncated text (max 50 chars) with tooltip |
| IP Address | `ipAddress` | Monospace font |
| Details | - | Button that opens `AuditDetailSheet` |

### Filters

| Filter | Type | URL Param |
|--------|------|-----------|
| Action Type | Select dropdown (populated from filter-options) | `action` |
| Resource Type | Select dropdown (populated from filter-options) | `resource_type` |
| User | Searchable select (populated from filter-options) | `user_id` |
| Date Range | Date picker (start + end) | `start_date`, `end_date` |
| Search | Text input (debounced) | `search` |
| Page | Number | `page` |
| Items per page | Select (10/25/50/100) | `limit` |

### Detail Sheet

A shadcn/ui Sheet component showing:

1. **Header**: Action badge + Resource type + Resource ID
2. **Metadata section**:
   - User (full name + username)
   - Timestamp (full datetime)
   - Endpoint (HTTP method + path)
   - IP Address
   - User Agent
   - Correlation ID (clickable - filters table to same correlation_id)
3. **Changes section** (if oldValues/newValues present):
   - Key-value diff view
   - Changed fields highlighted
   - Old value (red) -> New value (green) rendering

---

## 11. Enriched Audit for High-Value Actions

For ~25 critical actions, supplement the middleware's basic entries with explicit old/new value tracking.

### Priority Targets

| Action | File | Existing Support |
|--------|------|-----------------|
| ServiceRequest UPDATE | `src/backend/api/routers/support/requests_router.py:751-927` | Already builds `changed_fields`/`new_values` dicts |
| ServiceRequest TECHNICIAN_UPDATE | Same file, lines 930-1121 | Already builds change tracking |
| ServiceRequest ASSIGN/UNASSIGN | Same file | Has assignee info available |
| ServiceRequest REASSIGN_SECTION | Same file, lines 1423-1511 | Has old/new section |
| User UPDATE | `src/backend/api/routers/setting/users_router.py` | Has user data |
| User BLOCK | Same file | Has block state |
| User UPDATE_ROLES | Same file | Has old/new roles |
| Role UPDATE_PAGES | `src/backend/api/routers/setting/roles_router.py` | Has page lists |
| Role UPDATE_USERS | Same file | Has user lists |

### Pattern

```python
# In endpoint, before mutation:
old_snapshot = {
    "status_id": request.status_id,
    "priority_id": request.priority_id,
    "subcategory_id": request.subcategory_id,
}

# ... perform mutation ...

# After mutation, create enriched audit:
from core.audit_config import audit_handled_var

new_snapshot = {
    "status_id": updated_request.status_id,
    "priority_id": updated_request.priority_id,
    "subcategory_id": updated_request.subcategory_id,
}

audit_handled_var.set(True)  # Prevent middleware duplicate
await AuditService.create_audit_log_background(AuditCreate(
    user_id=current_user.id,
    action="UPDATE",
    resource_type="ServiceRequest",
    resource_id=str(request_id),
    old_values=old_snapshot,
    new_values=new_snapshot,
    endpoint=f"PATCH /backend/requests/{request_id}",
    ip_address=get_client_ip(request),
    correlation_id=get_correlation_id(),
    changes_summary=AuditService.generate_changes_summary(old_snapshot, new_snapshot),
))
```

---

## 12. Implementation Phases

### Phase 1: Backend Infrastructure Activation
1. Export `Audit` model from `db/__init__.py`
2. Verify/create `audit_logs` table migration
3. Add `create_audit_log_background()` to AuditService
4. Add filter methods to AuditService
5. Update `AuditFilter` schema with `search` field
6. Add `AuditFilterOptions` schema
7. Enhance audit endpoint with search/date filters
8. Add `/audit/filter-options` endpoint

### Phase 2: Route-Action Configuration
9. Create `src/backend/core/audit_config.py` with full route registry (~120 routes)
10. Add `audit_handled_var` ContextVar
11. Implement `resolve_route()` function

### Phase 3: Audit Middleware
12. Create `src/backend/core/middleware/audit.py`
13. Register in `core/middleware/__init__.py`
14. Register in `core/factory.py`

### Phase 4: Frontend
15. Create `types/audit.d.ts`
16. Create `lib/actions/audit.actions.ts`
17. Create `app/api/audit/route.ts` and `filter-options/route.ts`
18. Create page server component
19. Create table component with filters
20. Create column definitions
21. Create detail sheet
22. Add to navigation-sections.ts

### Phase 5: Enriched Audit (Deferrable)
23. Add enriched audit to ServiceRequest update endpoints
24. Add enriched audit to User management endpoints
25. Add enriched audit to Role management endpoints

---

## 13. Verification Steps

### Backend
1. Start backend: `uvicorn main:app --reload`
2. Make any mutation API call
3. Query: `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;`
4. Verify: user_id, action, resource_type, resource_id, endpoint, ip_address, correlation_id
5. `GET /backend/audit` with super admin token -> paginated response
6. `GET /backend/audit/filter-options` -> actions and resource types lists

### Frontend
1. Navigate to `/admin/management/audit-logs` as super admin
2. Data table loads with audit entries
3. Filter by action type, resource type, user, date range
4. Search works across summary and endpoint
5. Pagination works
6. Row click opens detail sheet with full metadata
7. Make a mutation elsewhere -> new entry appears on refresh

---

## 14. Key Files Reference

| Purpose | File | Status |
|---------|------|--------|
| Audit DB model | `src/backend/db/models.py:5453` | Existing |
| DB exports | `src/backend/db/__init__.py` | Modify |
| Audit service | `src/backend/api/services/audit_service.py` | Modify |
| Audit schemas | `src/backend/api/schemas/audit.py` | Modify |
| Audit endpoint | `src/backend/api/routers/auth/audit_router.py` | Modify |
| Route config | `src/backend/core/audit_config.py` | New |
| Audit middleware | `src/backend/core/middleware/audit.py` | New |
| Middleware package | `src/backend/core/middleware/__init__.py` | Modify |
| App factory | `src/backend/core/factory.py` | Modify |
| DB session | `src/backend/db/database.py` | Reuse `AsyncSessionLocal` |
| JWT decode | `src/backend/core/security.py:93` | Reuse `decode_token` |
| Correlation ID | `src/backend/core/middleware/correlation.py:20` | Reuse `get_correlation_id` |
| Client IP | `src/backend/core/dependencies.py:194` | Reuse `get_client_ip` |
| Frontend types | `src/it-app/types/audit.d.ts` | New |
| Server action | `src/it-app/lib/actions/audit.actions.ts` | New |
| API proxy | `src/it-app/app/api/audit/route.ts` | New |
| Filter options proxy | `src/it-app/app/api/audit/filter-options/route.ts` | New |
| Page component | `src/it-app/app/(it-pages)/admin/(admin-pages)/management/audit-logs/page.tsx` | New |
| Table component | `...audit-logs/_components/audit-table.tsx` | New |
| Column definitions | `...audit-logs/_components/audit-table-columns.tsx` | New |
| Detail sheet | `...audit-logs/_components/audit-detail-sheet.tsx` | New |
| Navigation | `src/it-app/lib/config/navigation-sections.ts` | Modify |
