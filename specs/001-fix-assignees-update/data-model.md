# Data Model: Fix Assignees List Update Bug

**Date**: 2026-01-08
**Status**: Documentation only - no schema changes required

## Overview

This bug fix does not introduce new entities or modify existing database schemas. This document serves as reference for the existing data model relevant to the fix.

## Existing Entities

### RequestAssignee

**Table**: `request_assignees`
**Location**: `src/backend/models/database_models.py:529-613`

| Field | Type | Description |
|-------|------|-------------|
| id | int (PK) | Auto-increment primary key |
| request_id | UUID (FK) | Reference to ServiceRequest |
| assignee_id | UUID (FK) | Reference to User (the technician) |
| assigned_by | UUID (FK, nullable) | Reference to User who made the assignment |
| created_at | datetime | Assignment timestamp |
| updated_at | datetime | Last update timestamp |
| is_deleted | bool | Soft delete flag |

**Constraints**:
- Unique: (request_id, assignee_id) - prevents duplicate assignments
- Foreign Keys: request_id → service_requests.id, assignee_id → users.id

### ServiceRequest (relevant fields)

**Table**: `service_requests`

| Field | Type | Relevance |
|-------|------|-----------|
| id | UUID (PK) | Referenced by RequestAssignee |
| status_id | int (FK) | Status changes on first assignment (Open → In Progress) |

### User (relevant fields)

**Table**: `users`

| Field | Type | Relevance |
|-------|------|-----------|
| id | UUID (PK) | Referenced as assignee_id |
| username | str | Display in UI |
| full_name | str | Display in UI and notifications |
| title | str | Display in notifications |

### SystemEvent / SystemMessage

**Tables**: `system_events`, `system_messages`

| Field | Type | Relevance |
|-------|------|-----------|
| event_key | str | "ticket_assigned" - triggers notification |
| message_template_en | str | English notification text |
| message_template_ar | str | Arabic notification text |

**Placeholders**:
- `{technician_name}` - Full name of assigned technician
- `{technician_title}` - Title of assigned technician

## Frontend Types

### Assignee (TypeScript)

**Location**: `src/it-app/lib/hooks/use-request-assignees.ts:11-21`

```typescript
interface Assignee {
  id: number;
  userId: string;           // UUID
  username: string;
  fullName: string | null;
  title: string | null;
  assignTypeId?: number;
  assignedBy: string | null;
  assignedByName: string | null;
  createdAt: string;
}
```

### AssigneesResponse (TypeScript)

```typescript
interface AssigneesResponse {
  requestId: string;
  assignees: Assignee[];
  total: number;
}
```

## Data Flow

```
1. User adds assignee via UI
   ↓
2. Frontend: Optimistic update to SWR cache
   ↓
3. POST /api/requests-details/{id}/assignees
   ↓
4. Next.js API Route → makeAuthenticatedRequest
   ↓
5. POST /api/v1/requests/{id}/assign
   ↓
6. Backend: Create RequestAssignee record
   ↓
7. Backend: Trigger ticket_assigned event (BUG: only on first assignment)
   ↓
8. Backend: Return updated request
   ↓
9. Frontend: Update SWR cache with server data (BUG: state mutation issue)
   ↓
10. UI: Display updated assignees list
```

## No Schema Changes Required

This bug fix modifies:
- **Backend endpoint logic** (notification trigger condition)
- **Frontend state management** (SWR cache mutation)

No database migrations or schema changes are needed.
