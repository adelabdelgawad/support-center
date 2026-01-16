# Cache Integration Data Flow

## Component Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PAGE MOUNT                                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  1. SESSION LOAD (useEffect)                        │
│                  - Parse user cookie                                 │
│                  - Set currentUserId                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              2. CACHE INITIALIZATION (useEffect)                    │
│              Depends: currentUserId, initialTicket.id               │
│                                                                      │
│              const cache = new MessageCache(userId)                 │
│              const syncEngine = new SyncEngine(cache, fetchFn)       │
│                                                                      │
│              const cached = await cache.getCachedMessages(id)        │
│              → [INSTANT LOAD FROM IndexedDB]                        │
│                                                                      │
│              setCacheInitialized(true)                               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  3. DELTA SYNC (useEffect)                          │
│                  Depends: cacheInitialized                          │
│                                                                      │
│                  setIsSyncing(true)                                  │
│                  const result = await syncEngine.syncChat(id)        │
│                  → [FETCH NEW MESSAGES]                              │
│                                                                      │
│                  if result.success:                                  │
│                    → Messages added to cache                         │
│                    → Gaps detected and recorded                      │
│                                                                      │
│                  setIsSyncing(false)                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 4. SIGNALR CONNECTION                                │
│                 - Real-time messages continue as before              │
│                 - New messages received via WebSocket               │
│                 - Optimistic updates work unchanged                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Sources

```
┌──────────────────────┐
│   SERVER (FastAPI)   │
│                      │
│  - Message Store     │
│  - Chat API          │
│  - SignalR Hub       │
└──────────┬───────────┘
           │
           │ REST API (Delta Sync)
           ▼
    ┌──────────────┐
    │ Next.js API  │
    │ /api/chat/   │
    └──────┬───────┘
           │
           │ getMessagesWithHeaders()
           ▼
    ┌──────────────────────────────────┐
    │     CLIENT (Browser)             │
    │                                  │
    │  ┌──────────────────────────┐    │
    │  │ IndexedDB (MessageCache) │    │
    │  │ - Messages               │    │
    │  │ - Sync State             │    │
    │  │ - Gap Tracking           │    │
    │  └──────────┬───────────────┘    │
    │             │                     │
    │             │ Instant Load        │
    │             ▼                     │
    │  ┌──────────────────────────┐    │
    │  │ RequestDetailContext     │    │
    │  │ - cacheInitialized       │    │
    │  │ - isSyncing              │    │
    │  │ - syncError              │    │
    │  └──────────┬───────────────┘    │
    │             │                     │
    │             │ Props               │
    │             ▼                     │
    │  ┌──────────────────────────┐    │
    │  │ TicketMessages Component │    │
    │  │ - Display cached data    │    │
    │  │ - Show sync status       │    │
    │  └──────────────────────────┘    │
    │                                  │
    │  ◄────────────────────────────┐  │
    │  │ SignalR (Real-time)        │  │
    │  │ - New messages             │  │
    │  │ - Read receipts            │  │
    │  │ - Typing indicators        │  │
    └──────────────────────────────────┘
```

## Sync Flow (Delta Sync)

```
┌──────────────────────┐
│  SyncEngine.syncChat │
└──────────┬───────────┘
           │
           ▼
    ┌─────────────────┐
    │ Get Chat Meta   │
    │ - lastSequence  │
    │ - lastSyncedAt  │
    │ - knownGaps     │
    └────────┬────────┘
             │
             ▼
      ┌──────────────┐
      │ Need Resync? │
      │              │
      │ - Stale? (>7 days)
      │ - Too many gaps? (>10)
      │ - Force sync?
      └──┬────────┬──┘
         │ No     │ Yes
         │        │
         ▼        ▼
    ┌────────┐ ┌──────────┐
    │ Delta  │ │ Full     │
    │ Sync   │ │ Resync   │
    └───┬────┘ └────┬─────┘
        │           │
        │           │ Clear cache
        ▼           ▼
    ┌──────────────────────┐
    │ Fetch Messages       │
    │ - since_sequence OR  │
    │ - limit: 100         │
    └──────────┬───────────┘
               │
               ▼
        ┌──────────────┐
        │ Add to Cache │
        │ - Batch put  │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ Update Meta  │
        │ - lastSynced  │
        │ - messageCount│
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ Detect Gaps  │
        │ - Record gaps│
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ Return Result│
        │ - messagesAdded
        │ - gapsDetected│
        └──────────────┘
```

## State Timeline

```
Time │ Event                        │ cacheInitialized │ isSyncing │ UI State
─────┼──────────────────────────────┼──────────────────┼──────────┼───────────
 0ms │ Page mount                   │ false            │ false    │ Loading
     │ SSR data renders             │                  │          │
─────┼──────────────────────────────┼──────────────────┼──────────┼───────────
100ms│ Session loaded               │ false            │ false    │ Loading
     │ currentUserId available      │                  │          │
─────┼──────────────────────────────┼──────────────────┼──────────┼───────────
200ms│ Cache init starts            │ false            │ false    │ Loading
     │ MessageCache created         │                  │          │
─────┼──────────────────────────────┼──────────────────┼──────────┼───────────
300ms│ Cached messages loaded       │ true             │ false    │ Ready
     │ from IndexedDB               │                  │          │ (instant)
─────┼──────────────────────────────┼──────────────────┼──────────┼───────────
350ms│ Delta sync starts            │ true             │ true     │ Syncing...
─────┼──────────────────────────────┼──────────────────┼──────────┼───────────
600ms│ Delta sync complete          │ true             │ false    │ Ready
     │ 5 new messages added         │                  │          │
─────┼──────────────────────────────┼──────────────────┼──────────┼───────────
∞    │ SignalR messages arrive      │ true             │ false    │ Real-time
     │ (normal operation)           │                  │          │ updates
```

## Key Integration Points

### 1. Non-Blocking Initialization
```typescript
// Cache runs in background, doesn't block UI
useEffect(() => {
  const init = async () => {
    // ... cache setup
    setCacheInitialized(true);
  };
  init();
}, [currentUserId]);
```

### 2. Automatic Delta Sync
```typescript
// Triggers after cache is ready
useEffect(() => {
  if (!cacheInitialized) return;
  syncEngine.syncChat(requestId);
}, [cacheInitialized]);
```

### 3. SignalR Continues Unchanged
```typescript
// SignalR connection independent of cache
const { messages, sendMessage } = useSignalRChatRoom(requestId, {
  enabled: !isSolved,
  initialMessages,
  onNewMessage: handleNewMessage,
});
```

## Benefits

1. **Instant Load**: Messages appear ~300ms after mount (from IndexedDB)
2. **Reduced API**: Only fetch delta (e.g., 5 messages vs 100)
3. **Offline Support**: Cached messages available without network
4. **Gap Filling**: Auto-detects and fills missing sequences
5. **Progressive UX**: Show cached data, sync in background
