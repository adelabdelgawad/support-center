# API Endpoint Inventory

This document catalogs all backend API endpoints discovered from frontend scanning.
Generated for integration test generation.

## Stack Overview

- **Backend**: FastAPI + SQLModel + PostgreSQL + Redis
- **Test Framework**: pytest + pytest-asyncio
- **Auth**: JWT-based passwordless authentication (30-day tokens)
- **Database**: AsyncSession with asyncpg driver

---

## 1. Authentication APIs (`/api/v1/auth/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | NO | Local user login (passwordless) |
| POST | `/auth/ad-login` | NO | Active Directory login |
| POST | `/auth/sso` | NO | SSO login (Windows username) |
| POST | `/auth/logout` | YES | Session invalidation |
| POST | `/auth/refresh` | YES | Token refresh |
| GET | `/auth/sessions` | YES | List active user sessions |
| DELETE | `/auth/sessions/{session_id}` | YES | Revoke specific session |
| GET | `/auth/me` | YES | Get current user info |
| POST | `/auth/validate` | YES | Validate token |

### Request/Response Schemas

**AD Login Request:**
```json
{
  "username": "string",
  "password": "string",
  "device_info": {
    "os": "string",
    "browser": "string",
    "user_agent": "string"
  }
}
```

**SSO Login Request:**
```json
{
  "username": "string",
  "device_info": { ... }
}
```

**Login Response:**
```json
{
  "access_token": "string",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "full_name": "string",
    "is_technician": "boolean",
    "is_super_admin": "boolean"
  }
}
```

---

## 2. Users APIs (`/api/v1/users/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/users` | YES | - | List users with pagination |
| POST | `/users` | YES | Admin | Create local user |
| GET | `/users/{id}` | YES | - | Get user by ID |
| GET | `/users/me` | YES | - | Get current user profile |
| PATCH | `/users/{id}` | YES | - | Update user profile |
| POST | `/users/{id}/block` | YES | Admin | Block/unblock user |
| GET | `/users/{id}/permissions` | YES | - | Get user permissions (cached) |
| PUT | `/users/{id}/roles` | YES | Admin | Update user roles |
| PUT | `/users/{id}/status` | YES | Admin | Toggle user active status |
| PUT | `/users/{id}/technician` | YES | Admin | Toggle technician status |
| POST | `/users/bulk-status` | YES | Admin | Bulk update user status |
| POST | `/users/bulk-technician` | YES | Admin | Bulk update technician status |

---

## 3. Service Requests APIs (`/api/v1/requests/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/requests` | YES | List requests with filters, pagination |
| POST | `/requests` | YES | Create new request |
| GET | `/requests/{id}` | YES | Get request details |
| PATCH | `/requests/{id}` | YES | Update request (status, priority, resolution) |
| GET | `/requests/{id}/assignees` | YES | Get request assignees |
| POST | `/requests/{id}/assign` | YES | Assign technician |
| DELETE | `/requests/{id}/assignees/{user_id}` | YES | Remove assignee |
| POST | `/requests/{id}/take` | YES | Self-assign request |
| GET | `/requests/technician-views` | YES | Get technician view (unassigned, my_unsolved, etc.) |
| GET | `/requests/business-unit-counts` | YES | Get request counts by business unit |

### Query Parameters (GET /requests)
- `page`: number (default: 1)
- `per_page`: number (default: 20, max: 100)
- `status_id`: number (optional)
- `priority_id`: number (optional)
- `category_id`: number (optional)
- `assigned_technician_id`: string (optional)
- `requester_id`: string (optional)
- `business_unit_id`: number (optional)
- `search`: string (optional)

### Business Rule: Resolution Required
When updating status to `6` (Resolved) or `8` (Closed), `resolution` field is **MANDATORY**.

---

## 4. Sub-Tasks APIs (`/api/v1/sub-tasks/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/sub-tasks/request/{request_id}` | YES | Get sub-tasks for request |
| POST | `/sub-tasks` | YES | Create sub-task |
| PATCH | `/sub-tasks/{id}` | YES | Update sub-task |
| DELETE | `/sub-tasks/{id}` | YES | Delete sub-task |
| GET | `/sub-tasks/request/{request_id}/stats` | YES | Get sub-task statistics |
| GET | `/sub-tasks/technician/my-tasks` | YES | Get my assigned sub-tasks |

---

## 5. Chat / Messages APIs (`/api/v1/chat/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/chat/messages/request/{request_id}` | YES | Get chat messages for request |
| POST | `/chat/messages` | YES | Send chat message |
| DELETE | `/chat/messages/{message_id}` | YES | Delete message |
| POST | `/chat/{request_id}/mark-read` | YES | Mark messages as read |
| GET | `/chat/{request_id}/unread` | YES | Get unread count for request |
| GET | `/chat/total-unread` | YES | Get total unread count |
| GET | `/chat/page-data` | YES | Get chat page data |
| GET | `/chat/all-tickets` | YES | Get all user tickets (requester app) |

### Chat Message Create
```json
{
  "request_id": "uuid",
  "content": "string",
  "is_screenshot": "boolean (optional)",
  "screenshot_file_name": "string (optional)"
}
```

---

## 6. Request Notes APIs (`/api/v1/request-notes/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/request-notes/{request_id}` | YES | Get notes for request |
| POST | `/request-notes` | YES | Create note |
| PATCH | `/request-notes/{id}` | YES | Update note |
| DELETE | `/request-notes/{id}` | YES | Delete note |

---

## 7. Request Statuses APIs (`/api/v1/request-statuses/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/request-statuses` | YES | - | List statuses |
| POST | `/request-statuses` | YES | Admin | Create status |
| GET | `/request-statuses/{id}` | YES | - | Get status |
| PUT | `/request-statuses/{id}` | YES | Admin | Update status |
| PUT | `/request-statuses/{id}/status` | YES | Admin | Toggle active |
| DELETE | `/request-statuses/{id}` | YES | Admin | Delete status |
| POST | `/request-statuses/bulk-status` | YES | Admin | Bulk update |
| GET | `/request-statuses/counts` | YES | - | Get counts |

---

## 8. Roles APIs (`/api/v1/roles/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/roles` | YES | - | List roles |
| POST | `/roles` | YES | Admin | Create role |
| GET | `/roles/{id}` | YES | - | Get role |
| PUT | `/roles/{id}` | YES | Admin | Update role |
| PUT | `/roles/{id}/status` | YES | Admin | Toggle active |
| DELETE | `/roles/{id}` | YES | Admin | Delete role |
| GET | `/roles/{id}/pages` | YES | - | Get role pages |
| PUT | `/roles/{id}/pages` | YES | Admin | Update role pages |
| GET | `/roles/{id}/users` | YES | - | Get role users |
| PUT | `/roles/{id}/users` | YES | Admin | Update role users |
| GET | `/roles/counts` | YES | - | Get counts |

---

## 9. Business Units APIs (`/api/v1/business-units/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/business-units` | YES | - | List business units |
| POST | `/business-units` | YES | Admin | Create business unit |
| GET | `/business-units/{id}` | YES | - | Get business unit |
| PUT | `/business-units/{id}` | YES | Admin | Update business unit |
| PUT | `/business-units/{id}/status` | YES | Admin | Toggle active |
| DELETE | `/business-units/{id}` | YES | Admin | Delete business unit |
| POST | `/business-units/bulk-status` | YES | Admin | Bulk update |
| GET | `/business-units/counts` | YES | - | Get counts |

---

## 10. Business Unit Regions APIs (`/api/v1/business-unit-regions/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/business-unit-regions` | YES | - | List regions |
| POST | `/business-unit-regions` | YES | Admin | Create region |
| GET | `/business-unit-regions/{id}` | YES | - | Get region |
| PUT | `/business-unit-regions/{id}` | YES | Admin | Update region |
| PUT | `/business-unit-regions/{id}/status` | YES | Admin | Toggle active |
| DELETE | `/business-unit-regions/{id}` | YES | Admin | Delete region |
| POST | `/business-unit-regions/bulk-status` | YES | Admin | Bulk update |
| GET | `/business-unit-regions/counts` | YES | - | Get counts |

---

## 11. Business Unit User Assigns APIs (`/api/v1/business-unit-user-assigns/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/business-unit-user-assigns/business-unit/{bu_id}` | YES | - | Get users for BU |
| GET | `/business-unit-user-assigns/user/{user_id}` | YES | - | Get BUs for user |
| POST | `/business-unit-user-assigns/bulk-assign` | YES | Admin | Bulk assign users to BU |
| POST | `/business-unit-user-assigns/bulk-remove` | YES | Admin | Bulk remove users from BU |

---

## 12. System Messages APIs (`/api/v1/system-messages/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/system-messages` | YES | - | List system messages |
| POST | `/system-messages` | YES | Admin | Create system message |
| GET | `/system-messages/{id}` | YES | - | Get system message |
| PATCH | `/system-messages/{id}` | YES | Admin | Update system message |
| PATCH | `/system-messages/{id}/toggle` | YES | Admin | Toggle active |
| DELETE | `/system-messages/{id}` | YES | Admin | Delete system message |
| POST | `/system-messages/bulk-status` | YES | Admin | Bulk update |

---

## 13. System Events APIs (`/api/v1/system-events/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/system-events` | YES | - | List system events |
| POST | `/system-events` | YES | Admin | Create system event |
| GET | `/system-events/{id}` | YES | - | Get system event |
| PATCH | `/system-events/{id}` | YES | Admin | Update system event |
| PATCH | `/system-events/{id}/toggle` | YES | Admin | Toggle active |
| DELETE | `/system-events/{id}` | YES | Admin | Delete system event |
| GET | `/system-events/counts` | YES | - | Get counts |

---

## 14. Custom Views APIs (`/api/v1/user-custom-views/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/user-custom-views` | YES | Get my custom view |
| PUT | `/user-custom-views/update` | YES | Update my custom view |
| POST | `/user-custom-views/reset` | YES | Reset my custom view |
| GET | `/user-custom-views/available-tabs` | YES | Get available tabs |

---

## 15. Reports APIs (`/api/v1/reports/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/reports/dashboard/executive` | YES | Executive dashboard data |
| GET | `/reports/dashboard/operations` | YES | Operations dashboard data |
| GET | `/reports/sla/compliance` | YES | SLA compliance report |
| GET | `/reports/agents/performance` | YES | Agent performance report |
| GET | `/reports/volume/analysis` | YES | Volume analysis report |

### Common Query Parameters
- `date_preset`: string (today, yesterday, last_7_days, last_30_days, custom)
- `start_date`: string (ISO date, required if preset=custom)
- `end_date`: string (ISO date, required if preset=custom)
- `business_unit_ids`: string (comma-separated)
- `technician_ids`: string (comma-separated)

---

## 16. SLA Configs APIs (`/api/v1/sla-configs/`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/sla-configs` | YES | - | List SLA configs |
| POST | `/sla-configs` | YES | Admin | Create SLA config |
| GET | `/sla-configs/{id}` | YES | - | Get SLA config |
| PATCH | `/sla-configs/{id}` | YES | Admin | Update SLA config |
| DELETE | `/sla-configs/{id}` | YES | Admin | Delete SLA config |
| GET | `/sla-configs/effective/{priority_id}` | YES | - | Get effective SLA |

---

## 17. Report Configs APIs (`/api/v1/report-configs/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/report-configs` | YES | List report configs |
| POST | `/report-configs` | YES | Create report config |
| GET | `/report-configs/{id}` | YES | Get report config |
| PATCH | `/report-configs/{id}` | YES | Update report config |
| DELETE | `/report-configs/{id}` | YES | Delete report config |

---

## 18. Service Sections APIs (`/api/v1/service-sections/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/service-sections` | YES | List service sections |

---

## 19. Other APIs

### Domain Users (`/api/v1/domain-users/`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/domain-users/search` | YES | Search AD users |

### Categories (`/api/v1/categories/`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/categories` | YES | List categories |

### Priorities (`/api/v1/priorities/`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/priorities` | YES | List priorities |

### Tags (`/api/v1/tags/`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/tags` | YES | List tags |
| POST | `/tags` | YES | Create tag |

### Files (`/api/v1/files/`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/files/upload` | YES | Upload file (MinIO) |
| GET | `/files/{file_id}` | YES | Download file |

---

## Test Coverage Priority

### High Priority (Core Business Logic)
1. ✅ Authentication (AD Login, SSO, Logout) - 14 existing tests
2. ⚠️ Service Requests (CRUD, status transitions, resolution validation)
3. ⚠️ Chat Messages (send, receive, mark read)
4. ⚠️ User Management (CRUD, role assignments, permissions)

### Medium Priority (Admin Features)
5. ⚠️ Roles Management
6. ⚠️ Business Units Management
7. ⚠️ Request Statuses Management
8. ⚠️ System Messages/Events

### Lower Priority (Secondary Features)
9. ⚠️ Sub-Tasks
10. ⚠️ Request Notes
11. ⚠️ Reports
12. ⚠️ SLA Configs
13. ⚠️ Custom Views

---

## Total Endpoints: ~110

- Authentication: 9
- Users: 12
- Service Requests: 10
- Sub-Tasks: 6
- Chat: 8
- Request Notes: 4
- Request Statuses: 8
- Roles: 11
- Business Units: 8
- Business Unit Regions: 8
- Business Unit User Assigns: 4
- System Messages: 7
- System Events: 7
- Custom Views: 4
- Reports: 5
- SLA Configs: 6
- Report Configs: 5
- Service Sections: 1
- Others: ~7
