# API Contract: Assignees Management

**Date**: 2026-01-08
**Status**: Existing endpoints - no changes to contract

## Overview

This document describes the existing API contracts for assignee management. The bug fixes do not modify the API contracts - only internal behavior.

## Endpoints

### POST /api/v1/requests/{request_id}/assign

**Purpose**: Assign a technician to a service request

**Request**:
```json
{
  "technician_id": "uuid-string"
}
```

**Response** (200 OK):
```json
{
  "id": "uuid-string",
  "ticketNo": "REQ-2024-0001",
  "title": "Request title",
  "statusId": 8,
  "status": {
    "id": 8,
    "name": "In Progress",
    "countAsSolved": false
  },
  // ... full ServiceRequest object
}
```

**Side Effects** (BUG FIX HERE):
- Creates `RequestAssignee` record
- Updates status from Open (1) to In Progress (8) if first assignment
- **BEFORE FIX**: Triggers `ticket_assigned` notification ONLY on first assignment
- **AFTER FIX**: Triggers `ticket_assigned` notification for EVERY new assignee

**Error Responses**:
- 400: Request already solved
- 400: User already assigned
- 403: Permission denied
- 404: Request or user not found

---

### DELETE /api/v1/requests/{request_id}/unassign

**Purpose**: Remove a technician from a service request

**Request**:
```json
{
  "technician_id": "uuid-string"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "User unassigned successfully"
}
```

**Error Responses**:
- 400: Cannot remove last assignee
- 400: Request already solved
- 404: Assignment not found

---

### GET /api/v1/requests/{request_id}/assignees

**Purpose**: Get all assignees for a service request

**Response** (200 OK):
```json
{
  "requestId": "uuid-string",
  "assignees": [
    {
      "id": 123,
      "userId": "uuid-string",
      "username": "john.doe",
      "fullName": "John Doe",
      "title": "Senior Technician",
      "assignTypeId": 1,
      "assignedBy": "uuid-string",
      "assignedByName": "Admin User",
      "createdAt": "2026-01-08T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

### POST /api/v1/requests/{request_id}/take

**Purpose**: Self-assign to an unassigned request

**Request**: No body required

**Response** (200 OK): Same as `/assign`

**Preconditions**:
- Request must have 0 assignees
- Current user must be a technician

---

## Next.js Proxy Routes

The frontend calls Next.js API routes which proxy to the backend:

| Frontend Route | Backend Route |
|----------------|---------------|
| POST `/api/requests-details/{id}/assignees` | POST `/api/v1/requests/{id}/assign` |
| DELETE `/api/requests-details/{id}/assignees` | DELETE `/api/v1/requests/{id}/unassign` |
| GET `/api/requests-details/{id}/assignees` | GET `/api/v1/requests/{id}/assignees` |
| POST `/api/requests-details/{id}/take` | POST `/api/v1/requests/{id}/take` |

---

## System Events (Notification)

### ticket_assigned

**Trigger**: When a technician is assigned to a request

**Event Data**:
```json
{
  "technician_name": "John Doe",
  "technician_title": "Senior Technician"
}
```

**Message Templates**:
- English: "Assigned to {technician_name} ({technician_title})"
- Arabic: "تم تعيين {technician_name} ({technician_title})"

**Delivery**:
- Creates system message in chat (sender_id = NULL)
- Broadcasts via SignalR to all connected users in the request room
- Triggers desktop notification for the assigned technician
