# Quickstart: WhatsApp-Style Local Cache

**Feature**: 001-whatsapp-local-cache
**Date**: 2026-01-16

---

## Overview

This guide provides quick setup instructions for implementing the local cache feature across all platforms.

---

## Prerequisites

### Backend
- Python 3.12+
- Running PostgreSQL and Redis instances
- Backend server running on port 8000

### IT App (Next.js)
```bash
cd src/it-app
bun --version  # Ensure bun is installed
```

### Requester App (Tauri)
```bash
cd src/requester-app
cargo --version  # Rust toolchain
bun --version    # Frontend dependencies
```

---

## Quick Setup

### 1. Backend: Add Delta Sync Support

No new dependencies required. Modify existing endpoint:

```python
# src/backend/api/v1/endpoints/chat.py

# Add new query parameters to get_messages():
since_sequence: Optional[int] = Query(None, ge=0, description="Delta sync cursor")
start_sequence: Optional[int] = Query(None, ge=1, description="Range start")
end_sequence: Optional[int] = Query(None, ge=1, description="Range end")
```

### 2. IT App: Install Dependencies

```bash
cd src/it-app
bun add idb @tanstack/react-virtual
```

### 3. Requester App: Install Dependencies

```bash
cd src/requester-app
bun add @tanstack/solid-virtual
```

---

## Key Implementation Files

### Backend Changes

| File | Change |
|------|--------|
| `api/v1/endpoints/chat.py` | Add delta sync parameters |
| `services/chat_service.py` | Pass through new parameters |
| `repositories/chat_repository.py` | Add query conditions |

### IT App (New Files)

```
src/it-app/lib/cache/
├── db.ts              # IndexedDB initialization
├── message-cache.ts   # Message CRUD operations
├── media-manager.ts   # Media blob storage
├── sync-engine.ts     # Delta sync orchestration
└── schemas.ts         # TypeScript types (from contracts/)
```

### Requester App (Extend Existing)

```
src/requester-app/src/src/lib/
├── message-cache.ts   # Add delta sync methods
├── sync-engine.ts     # New file
└── media-manager.ts   # New file

src/requester-app/src/src/components/settings/
└── cache-settings.tsx # New settings panel
```

---

## Basic Usage Examples

### Initialize Cache (IT App)

```typescript
// src/it-app/lib/cache/db.ts
import { openDB } from 'idb';
import { DB_VERSION, STORE_NAMES, type DBSchema } from './schemas';

export async function initDB(userId: string) {
  const dbName = `support-center-${userId}-cache`;

  return openDB<DBSchema>(dbName, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 3) {
        // Create stores for v3
        const messages = db.createObjectStore(STORE_NAMES.MESSAGES, { keyPath: 'id' });
        messages.createIndex('by_request', 'requestId');
        messages.createIndex('by_request_sequence', ['requestId', 'sequenceNumber'], { unique: true });
        // ... additional stores
      }
    },
  });
}
```

### Cache-First Loading

```typescript
// In chat component
async function loadMessages(requestId: string) {
  // 1. Show cached immediately
  const cached = await messageCache.getCachedMessages(requestId);
  setMessages(cached);

  // 2. Delta sync in background
  const meta = await messageCache.getChatMeta(requestId);
  const sinceSequence = meta?.lastSyncedSequence || 0;

  const response = await fetch(
    `/api/chat/messages/request/${requestId}?limit=100&since_sequence=${sinceSequence}`
  );
  const newMessages = await response.json();

  // 3. Merge and update cache
  await messageCache.addMessagesBatch(newMessages);
  setMessages(prev => [...prev, ...newMessages]);
}
```

### Offline Message Queue

```typescript
// Queue message when offline
async function sendMessage(requestId: string, content: string) {
  const tempId = crypto.randomUUID();

  // Optimistic UI update
  const optimistic: CachedMessage = {
    id: tempId,
    tempId,
    requestId,
    content,
    status: 'pending',
    // ... other fields
  };
  await messageCache.addMessage(optimistic);

  if (navigator.onLine) {
    // Send immediately
    await sendToServer(optimistic);
  } else {
    // Queue for later
    await syncEngine.queueOperation({
      type: 'send_message',
      requestId,
      payload: { type: 'send_message', content, tempId },
      maxRetries: 5,
    });
  }
}
```

---

## Testing

### Unit Tests

```bash
# Backend
cd src/backend
pytest tests/test_chat_delta_sync.py -v

# IT App
cd src/it-app
bun test lib/cache/

# Requester App
cd src/requester-app
bun test src/lib/
```

### Manual Testing

1. **Cache Loading**
   - Open a chat with messages
   - Refresh the page
   - Messages should appear instantly from cache

2. **Delta Sync**
   - Open chat in two tabs
   - Send message from tab 1
   - Tab 2 should receive via SignalR and cache

3. **Offline Queue**
   - Disable network (DevTools)
   - Send a message
   - See "pending" indicator
   - Re-enable network
   - Message should send automatically

4. **Large Chat Performance**
   - Load chat with 1000+ messages
   - Scroll quickly
   - Should maintain 60 FPS

---

## Configuration

### Environment Variables

```bash
# No new backend env vars required

# IT App - optional cache tuning
NEXT_PUBLIC_CACHE_MAX_SIZE_MB=100
NEXT_PUBLIC_CACHE_TTL_DAYS=7

# Requester App - via settings.json
# %APPDATA%\supportcenter.requester\settings.json
{
  "cache": {
    "maxSizeMB": 500,
    "ttlDays": 7,
    "mediaEvictionPolicy": "lru"
  }
}
```

---

## Troubleshooting

### Cache Not Loading

```typescript
// Check IndexedDB in DevTools > Application > IndexedDB
// Verify database exists with correct stores
const stats = await messageCache.getStats();
console.log('Cache stats:', stats);
```

### Delta Sync Not Working

```typescript
// Check response headers
const response = await fetch(`/api/chat/messages/...`);
console.log('X-Newest-Sequence:', response.headers.get('X-Newest-Sequence'));
console.log('X-Has-Newer:', response.headers.get('X-Has-Newer'));
```

### Offline Queue Stuck

```typescript
// Check queue status
const queue = await syncEngine.getQueueSize();
console.log('Pending operations:', queue);

// Force process queue
await syncEngine.processOfflineQueue();
```

---

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks
2. Start with backend delta sync endpoint
3. Implement IT App cache layer
4. Extend Requester App cache
5. Add Settings UI for desktop app
