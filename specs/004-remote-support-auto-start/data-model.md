# Data Model: Remote Support Auto-Start with User Awareness

**Feature**: 004-remote-support-auto-start
**Date**: 2026-01-14

## Overview

This feature requires no new database tables or schema changes. It leverages existing data structures and adds client-side state for UI rendering.

## Existing Entities (No Changes)

### RemoteAccessSession (Database)

Already exists in `src/backend/models/database_models.py`:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| agent_id | UUID | FK to User (IT agent) |
| requester_id | UUID | FK to User (employee) |
| request_id | UUID | FK to ServiceRequest |
| status | Enum | active, ended, disconnected |
| control_enabled | Boolean | Whether input control is active |
| created_at | DateTime | Session start timestamp |
| ended_at | DateTime | Session end timestamp (nullable) |

### SignalR Payload (Existing)

Message type: `RemoteSessionAutoStart`

```typescript
interface RemoteSessionAutoStartPayload {
  sessionId: string;
  agentId: string;
  agentName: string;      // ← Used for banner display
  requestId: string;
  requestTitle: string;
  mode: 'view' | 'control';
  autoApproved: boolean;
  isReconnection?: boolean;
}
```

## New Client-Side State

### RemoteSessionBannerState (SolidJS Store)

Added to existing `remote-access-store.ts`:

```typescript
interface RemoteSessionBannerState {
  isVisible: boolean;
  sessions: Array<{
    sessionId: string;
    agentName: string;
    startedAt: string;
  }>;
}
```

**State Transitions**:

```
┌─────────────┐    SignalR: RemoteSessionAutoStart    ┌─────────────┐
│  isVisible  │ ──────────────────────────────────────▶│  isVisible  │
│   false     │                                        │   true      │
│  sessions[] │                                        │ sessions[+] │
└─────────────┘                                        └─────────────┘
                                                              │
                                                              │
                    SignalR: RemoteSessionEnded               │
┌─────────────┐◀──────────────────────────────────────────────┘
│  isVisible  │
│   false     │  (when sessions.length === 0)
│  sessions[] │
└─────────────┘
```

## Audit Log Format

No database storage. Structured log entries:

```json
{
  "event": "remote_session_started",
  "session_id": "uuid",
  "agent_id": "uuid",
  "agent_username": "string",
  "requester_id": "uuid",
  "timestamp": "ISO8601"
}
```

```json
{
  "event": "remote_session_ended",
  "session_id": "uuid",
  "agent_id": "uuid",
  "agent_username": "string",
  "requester_id": "uuid",
  "duration_seconds": "number",
  "end_reason": "agent_ended | disconnect | timeout",
  "timestamp": "ISO8601"
}
```

## Validation Rules

| Rule | Enforcement |
|------|-------------|
| agentName must be non-empty | Fallback to "IT Support" if missing |
| sessionId must be valid UUID | Validated by SignalR handler |
| Banner shows for active sessions only | Derived from store state |

## Relationships

```
┌──────────────────┐       ┌──────────────────┐
│ RemoteAccess     │       │ RemoteSession    │
│ Session (DB)     │◀──────│ BannerState      │
│                  │  1:1  │ (Client)         │
│ - id             │       │                  │
│ - agent_id       │       │ - sessionId      │
│ - agentName*     │       │ - agentName      │
└──────────────────┘       │ - isVisible      │
        │                  └──────────────────┘
        │
        ▼
┌──────────────────┐
│ User (DB)        │
│                  │
│ - id             │
│ - username       │
│ - full_name      │
└──────────────────┘

* agentName derived from User.full_name || User.username
```
