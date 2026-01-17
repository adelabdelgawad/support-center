# Deterministic Chat Sync Implementation

## Overview

This document describes the implementation of a deterministic, sequence-based chat message synchronization system for the Requester App (Tauri + SolidJS).

### Goals
- Load chats instantly from SQLite cache (non-blocking)
- Validate local data against backend-provided sequence numbers
- Sync only when proven necessary (not blind polling)
- Handle offline/reconnect gracefully

### Core Concepts

**Sync State Machine:**
```
UNKNOWN (default) → validation → SYNCED (if valid)
                              → OUT_OF_SYNC (if invalid) → resync → SYNCED
```

**States:**
- `UNKNOWN`: Local data not yet validated (default, NOT an error)
- `SYNCED`: Local messages validated and trusted
- `OUT_OF_SYNC`: Proven missing or incomplete message data

**Validation Rules (client-side, O(n)):**
1. If backend sequence is unknown, defer validation (stay UNKNOWN)
2. Messages must be continuous between min_seq and max_seq
3. Local max_seq must equal last_known_backend_seq

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TICKET LIST                               │
│  Fetches: ticket metadata + lastMessageSequence per chat         │
│  Purpose: Establish expected sequence bounds without messages    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CHAT OPEN                                 │
│  1. Load from SQLite immediately (no blocking)                   │
│  2. Set sync_state = UNKNOWN                                     │
│  3. Validate: local max_seq vs last_known_backend_seq            │
│  4. If valid → SYNCED (no fetch), else → OUT_OF_SYNC (resync)   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SEQUENCE VALIDATION                          │
│  Rules (client-side, O(n)):                                      │
│  - Messages continuous between min_seq and max_seq               │
│  - count == (max_seq - min_seq + 1)                              │
│  - local max_seq == last_known_backend_seq                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Phase 1: Backend Changes

#### 1.1 LastMessageInfo Schema
**File:** `src/backend/schemas/service_request/technician_views.py`
```python
class LastMessageInfo(HTTPSchemaModel):
    content: str
    sender_name: Optional[str] = None
    created_at: datetime
    sequence_number: int  # For deterministic chat sync validation
```

#### 1.2 Requests Endpoint
**File:** `src/backend/api/v1/endpoints/requests.py`
- Updated `LastMessageInfo` creation to include `sequence_number=last_msg.sequence_number`

#### 1.3 Chat Page Schema
**File:** `src/backend/schemas/chat_message/chat_page.py`
```python
class ChatRequestListItem(HTTPSchemaModel):
    # ... existing fields
    last_message_sequence: Optional[int] = Field(
        None, description="Sequence number of the last message (for deterministic chat sync)"
    )
```

**File:** `src/backend/services/chat_service.py`
- Updated `_get_chat_messages_list()` to include `last_message_sequence`

---

### Phase 2: Tauri SQLite Setup

#### 2.0 Plugin Installation
**File:** `src/requester-app/src/src-tauri/Cargo.toml`
```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

**File:** `src/requester-app/src/src-tauri/src/lib.rs`
```rust
.plugin(tauri_plugin_sql::Builder::default().build())
```

**File:** `src/requester-app/src/src-tauri/capabilities/default.json`
```json
"sql:default",
"sql:allow-load",
"sql:allow-execute",
"sql:allow-select",
"sql:allow-close",
```

**File:** `src/requester-app/src/package.json`
```json
"@tauri-apps/plugin-sql": "^2.0.0",
```

#### 2.1 TypeScript Types
**File:** `src/requester-app/src/src/types/index.ts`
```typescript
// Added to ChatMessageListItem
lastMessageSequence?: number;

// New types
export type ChatSyncState = 'UNKNOWN' | 'SYNCED' | 'OUT_OF_SYNC';

export interface ChatSyncMeta {
  requestId: string;
  localMinSeq: number | null;
  localMaxSeq: number | null;
  lastKnownBackendSeq: number | null;
  syncState: ChatSyncState;
  lastValidatedAt: number;
  messageCount: number;
}

export interface SequenceValidationResult {
  valid: boolean;
  reason: 'validated' | 'backend_seq_unknown' | 'gap_detected' | 'sequence_mismatch' | 'no_messages';
  details?: string;
}
```

#### 2.2 SQLite Message Cache
**File:** `src/requester-app/src/src/lib/sqlite-message-cache.ts`

**Database Schema:**
```sql
-- Messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  sender_id TEXT,
  sender_json TEXT,
  content TEXT NOT NULL,
  sequence_number INTEGER,
  is_screenshot INTEGER DEFAULT 0,
  screenshot_file_name TEXT,
  is_read_by_current_user INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  status TEXT,
  temp_id TEXT,
  client_temp_id TEXT,
  is_system_message INTEGER DEFAULT 0,
  file_name TEXT,
  file_size INTEGER,
  file_mime_type TEXT,
  cached_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_messages_request_id ON messages(request_id);
CREATE INDEX idx_messages_request_sequence ON messages(request_id, sequence_number);
CREATE INDEX idx_messages_cached_at ON messages(cached_at);

-- Sync state table
CREATE TABLE chat_sync_state (
  request_id TEXT PRIMARY KEY,
  local_min_seq INTEGER,
  local_max_seq INTEGER,
  last_known_backend_seq INTEGER,
  sync_state TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_validated_at INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0
);

-- Metadata table
CREATE TABLE chat_meta (
  request_id TEXT PRIMARY KEY,
  latest_sequence INTEGER,
  last_updated INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0
);
```

**Key Methods:**
- `getCachedMessages(requestId)` - Get messages sorted by sequence
- `cacheMessages(requestId, messages)` - Replace all messages for a chat
- `addMessage(message)` - Add single message
- `getSyncMeta(requestId)` - Get sync state
- `updateSyncState(requestId, state)` - Update sync state
- `updateBackendSequence(requestId, seq)` - Update expected backend sequence
- `validateSequences(requestId)` - Deterministic validation
- `markAllChatsUnknown()` - For connectivity restoration

---

### Phase 3: Sync Logic

#### 3.1 Chat Sync Service
**File:** `src/requester-app/src/src/lib/chat-sync-service.ts`

**Key Methods:**

```typescript
class ChatSyncService {
  // Called when user opens a chat
  async onChatOpen(requestId: string): Promise<void>

  // Resync a single chat (scoped, not global)
  async resync(requestId: string): Promise<void>

  // User-triggered resync (always runs)
  async manualResync(requestId: string): Promise<void>

  // Every 5 min while chat open
  async periodicRevalidate(requestId: string): Promise<void>

  // Marks all chats UNKNOWN on connectivity restore
  async onConnectivityRestored(): Promise<void>

  // Handles WebSocket messages, detects gaps
  async onNewMessage(message): Promise<void>
}

// Reactive signal for UI
export function isChatSyncing(requestId: string): boolean
```

---

### Phase 4: UI Components

#### 4.1 Sync Indicator
**File:** `src/requester-app/src/src/components/ui/sync-indicator.tsx`

```tsx
// Shows spinner ONLY during active resync (not permanent state)
export function SyncIndicator(props: { requestId: string })
export function SyncIndicatorCompact(props: { requestId: string })
```

#### 4.2 Chat Sync Hook
**File:** `src/requester-app/src/src/hooks/use-chat-sync.ts`

```typescript
export function useChatSync(requestId: Accessor<string | null>): {
  syncState: Accessor<ChatSyncState>;
  isSyncing: Accessor<boolean>;
  manualResync: () => Promise<void>;
  cachedMessages: Accessor<ChatMessage[]>;
  refreshCachedMessages: () => Promise<void>;
}
```

---

### Phase 5: Integration

#### 5.1 Tickets Query
**File:** `src/requester-app/src/src/queries/tickets.ts`

```typescript
import { chatSyncService } from "@/lib/chat-sync-service";

// After fetching tickets, update backend sequences
for (const ticket of data.chatMessages) {
  if (ticket.lastMessageSequence !== undefined) {
    chatSyncService.updateBackendSequence(ticket.id, ticket.lastMessageSequence);
  }
}
```

#### 5.2 Message Cache Bridge
**File:** `src/requester-app/src/src/lib/message-cache-bridge.ts`

Migration bridge supporting gradual IndexedDB → SQLite transition:
- **Phase 1:** Write to both, read from IndexedDB
- **Phase 2:** Write to both, read from SQLite (CURRENT)
- **Phase 3:** Write and read from SQLite only

#### 5.3 Chat Page Updates
**File:** `src/requester-app/src/src/routes/ticket-chat.tsx`

1. Replaced `messageCache` with `messageCacheBridge`
2. Added manual resync button to header:
```tsx
<Button
  onClick={() => chatSyncService.manualResync(ticketId())}
  disabled={isChatSyncing(ticketId())}
  title="Resync messages"
>
  <Show when={isChatSyncing(ticketId())} fallback={<RefreshCw />}>
    <RefreshCw class="animate-spin" />
  </Show>
</Button>
```

---

## Files Changed

### Backend (4 files)
| File | Change |
|------|--------|
| `src/backend/schemas/service_request/technician_views.py` | Added `sequence_number` to `LastMessageInfo` |
| `src/backend/api/v1/endpoints/requests.py` | Pass sequence to `LastMessageInfo` |
| `src/backend/schemas/chat_message/chat_page.py` | Added `last_message_sequence` to `ChatRequestListItem` |
| `src/backend/services/chat_service.py` | Include `lastMessageSequence` in response |

### Requester App - Tauri (4 files)
| File | Change |
|------|--------|
| `src/src-tauri/Cargo.toml` | Added `tauri-plugin-sql` dependency |
| `src/src-tauri/src/lib.rs` | Registered SQL plugin |
| `src/src-tauri/capabilities/default.json` | Added SQL permissions |
| `package.json` | Added `@tauri-apps/plugin-sql` |

### Requester App - Frontend (8 files)
| File | Change |
|------|--------|
| `src/types/index.ts` | Added sync types, `lastMessageSequence` |
| `src/lib/sqlite-message-cache.ts` | **NEW** - SQLite cache with sync state |
| `src/lib/chat-sync-service.ts` | **NEW** - Sync orchestration |
| `src/lib/message-cache-bridge.ts` | **NEW** - Migration bridge |
| `src/hooks/use-chat-sync.ts` | **NEW** - SolidJS hook |
| `src/components/ui/sync-indicator.tsx` | **NEW** - UI component |
| `src/queries/tickets.ts` | Backend sequence updates |
| `src/routes/ticket-chat.tsx` | Cache bridge + resync button |

---

## Setup Instructions

```bash
# 1. Install the SQL plugin npm package
cd src/requester-app/src && npm install

# 2. Build the Rust side to compile tauri-plugin-sql
cd src/requester-app/src/src-tauri && cargo build
```

---

## Behavioral Rules

### Tickets Page (Global, Cheap Sync)
- Fetch ticket list metadata only (including `lastMessageSequence`)
- Update local sync metadata
- Do NOT fetch chat messages
- Do NOT trigger chat message syncs automatically

### Chat Opening
1. Load messages immediately from SQLite (no blocking)
2. Set `sync_state = UNKNOWN`
3. If `lastKnownBackendSeq` is known, run validation
4. If validation passes → `SYNCED` (no fetch)
5. If validation fails → `OUT_OF_SYNC` (trigger resync)

### Resync Behavior
- Triggered ONLY when `sync_state === OUT_OF_SYNC` OR user manual request
- Scoped to a single chat (never all chats)
- Fetch only missing messages or bounded recent window
- Re-run validation after completion
- Clear `OUT_OF_SYNC` ONLY if validation passes

### Periodic Revalidation
- Every 5 minutes while chat is open
- Compare `lastKnownBackendSeq` vs local `max_seq`
- If mismatch → trigger resync
- If match → no-op

### Offline → Online Handling
- Mark all chats as `UNKNOWN`
- Refresh ticket list metadata once
- Do NOT auto-sync messages
- Chats self-heal on open/validation

### Sync Indicator (UX)
- Visible ONLY while actual resync is in progress
- No permanent "synced" or "true" state shown
- No indicator during validation-only checks

---

## Verification Checklist

- [x] Backend returns `lastMessageSequence` in ticket list
- [x] SQLite cache stores messages with sequence numbers
- [x] Sync state tracked per chat (UNKNOWN/SYNCED/OUT_OF_SYNC)
- [x] Sequence validation detects gaps
- [x] Manual resync button in chat header
- [x] Tickets query updates backend sequences on fetch
- [x] Migration bridge supports gradual IndexedDB → SQLite transition
- [x] Chats load instantly from cache
- [x] No unnecessary sync calls when data is valid
- [x] Immediate chat open before metadata load does NOT cause false sync
