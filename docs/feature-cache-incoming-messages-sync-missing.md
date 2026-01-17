# Task: Cache Incoming Messages Immediately and Sync Only Missing Chat Messages

## Context & Assumptions
- This is a **production system**.
- The backend guarantees a **strictly increasing, immutable, per-chat sequence ID** for messages.
- Sequence IDs are gap-free unless messages are missing.
- Messages may arrive when:
  - the chat is open
  - the chat is not open
  - the app just launched
  - the app is in background
- Existing behavior must be preserved unless explicitly changed.
- Avoid unnecessary backend requests, full reloads, and UI blocking.

---

## High-Level Goal
Ensure that:
- **Every incoming message is cached immediately** in its chat cache
- Chats render instantly from cache, even if history is partial
- When a chat is incomplete, **only missing messages are fetched**, never the full chat
- Clear UX feedback is shown while missing history is syncing
- The Resync button appears only when the chat view is fully ready

---

## Core Rules

### 1. Incoming Message Handling (Critical)
For **every incoming message**, regardless of chat state:
- Identify `chat_id`
- Store the message immediately in the local cache for that chat
- Update:
  - last message
  - last sequence ID
  - unread count (if chat is not open)
- This must happen even if:
  - the chat was never opened before
  - the chat cache previously did not exist
  - the user only sees a notification or ticket list update

Incoming messages must never depend on opening the chat.

---

### 2. Chat Cache Characteristics
- A chat cache may contain:
  - full history
  - partial history
  - only the latest message(s)
- Partial cache is a valid and expected state.

---

### 3. Chat Opening Behavior
When the user opens a chat:
1. Render immediately using whatever messages exist in the local cache.
2. Do NOT block rendering on backend requests.
3. Set `sync_state = UNKNOWN` initially.
4. Validate message sequence only when backend expected sequence is known.

---

### 4. Partial History Detection
A chat is considered **partially synced** when:
- Cached messages do not form a continuous sequence window
- OR cached message count does not match `(max_seq - min_seq + 1)`
- OR local `max_seq < last_known_backend_seq`

Partial history is NOT an error.

---

### 5. Sync Trigger on Partial History
If partial history is detected:
- Set `sync_state = OUT_OF_SYNC`
- Trigger a **chat-scoped sync for missing messages only**
- Do NOT discard or reload existing cached messages

---

### 6. Missing-Messages-Only Sync (Mandatory)
When a chat is OUT_OF_SYNC, the client MUST:
- Calculate the missing sequence range(s), for example:
  - `from_seq = local_max_seq + 1`
  - OR first detected sequence gap
- Request **only the missing messages** from the backend
- Never request the full chat history unless:
  - the backend cannot support partial fetch
  - OR local cache is corrupted beyond recovery (must be justified)

The default and expected behavior is **incremental repair**, not full reload.

---

### 7. Skeleton / Placeholder UX
While missing messages are syncing:
- Render cached messages normally
- Show a **skeleton / placeholder only for missing older messages**
- Do NOT replace the entire chat with a loading screen
- Remove the skeleton once missing messages are fetched and merged

Skeleton represents missing history, not a generic loading state.

---

### 8. Sync Indicator Rules
- Show sync indicator ONLY while missing messages are actively being fetched
- Do NOT show indicator during validation-only phases
- Do NOT show permanent "synced" or "success" states

---

### 9. Resync Button Visibility
The manual **Resync** button:
- Is scoped to the current chat only
- Forces a missing-messages-only sync by default

Visibility rules:
- Do NOT show while chat view is still initializing
- Do NOT show during skeleton-only initial render
- Show ONLY when:
  - chat view is fully rendered
  - messages container exists
  - user can interact with the chat

Example condition:
- `chat_view_ready === true`

---

### 10. Manual Resync Behavior
When the user clicks **Resync**:
- Re-run sequence validation
- Fetch **only missing messages**
- Merge safely with existing cached messages
- Re-run validation after completion
- Clear `OUT_OF_SYNC` only if validation passes

Manual resync must NOT blindly reload the full chat.

---

## Constraints
- No blocking UI on backend requests
- No full chat reloads by default
- No message loss
- Avoid duplicate or concurrent sync requests
- Treat deletions and schema changes as high-risk

---

## Validation Checklist
- [ ] Incoming messages are cached even if chat was never opened
- [ ] Chat opens instantly with cached messages
- [ ] Partial history triggers missing-messages-only sync
- [ ] Full chat reloads never happen unless explicitly justified
- [ ] Skeleton appears only for missing messages
- [ ] Cached messages are never hidden during sync
- [ ] Resync button appears only after chat view is ready
- [ ] Sync indicator appears only during real message fetch
- [ ] Existing behavior preserved unless explicitly changed

---

## Deliverables
- Implement incrementally with clear commit boundaries
- Verify backend supports partial message fetch by sequence
- Keep changes minimal, readable, and production-safe

---

## Storage Architecture

**SQLite Database**: `sqlite:message_cache.db`
- **Location**: `%APPDATA%\<app-identifier>\` (Windows) via `@tauri-apps/plugin-sql`
- **Persists across sessions**: Yes - survives app restarts
- **Migration Phase**: Phase 2 (reading from SQLite, writing to both SQLite + IndexedDB)

The Tauri SQL plugin automatically handles database placement in the platform-appropriate app data directory:
- Windows: `%APPDATA%\<app-name>\message_cache.db`
- macOS: `~/Library/Application Support/<app-name>/message_cache.db`
- Linux: `~/.local/share/<app-name>/message_cache.db`

---

## Current Architecture Analysis

### Existing Files & Their Roles

| File | Purpose | Relevant to This Task |
|------|---------|----------------------|
| `src/signalr/notification-signalr-context.tsx` | Receives all incoming message notifications | **Critical** - Must cache messages here |
| `src/lib/message-cache-bridge.ts` | Abstraction over SQLite/IndexedDB | **Critical** - Cache write target |
| `src/lib/sqlite-message-cache.ts` | SQLite storage with sync state | **Critical** - Sync state management |
| `src/lib/chat-sync-service.ts` | Validates sequences, triggers resync | **Critical** - Needs partial sync logic |
| `src/routes/ticket-chat.tsx` | Chat view (2000+ lines) | **Critical** - Skeleton UX, resync button |
| `src/api/messages.ts` | Backend API for messages | **Important** - Verify partial fetch support |
| `src/hooks/use-chat-sync.ts` | Sync state hook for components | **Important** - Expose sync status |

### Current Gaps vs Requirements

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| Cache incoming messages immediately | `onNewMessageNotification` only routes to handlers | Messages not cached when chat is closed |
| Missing-messages-only sync | `resync()` fetches from cursor, replaces all | No incremental gap-fill logic |
| Skeleton for missing history only | Full skeleton during initial load | Skeleton replaces entire chat |
| Resync button visibility | Always visible after mount | No `chat_view_ready` guard |
| Partial history as valid state | `OUT_OF_SYNC` treated as error state | UX may confuse users |

---

## Implementation Plan

### Phase 1: Cache Incoming Messages Immediately

**Goal**: Every incoming message is cached regardless of chat state.

#### 1.1 Update `notification-signalr-context.tsx`

**Location**: `src/requester-app/src/src/signalr/notification-signalr-context.tsx`

**Change**: In `onNewMessageNotification` handler, after normalizing the message:

```typescript
// BEFORE: Only routes to handlers
handlers.forEach(handler => handler(data));

// AFTER: Cache immediately, then route to handlers
const message = normalizeMessage(data.message);
await messageCacheBridge.addMessage(message);
handlers.forEach(handler => handler(data));
```

**Considerations**:
- Must handle async cache write without blocking notification flow
- Must not duplicate messages if chat is already open (handler may also cache)
- Use `addMessage` which handles duplicates via `ON CONFLICT` in SQLite

#### 1.2 Update SQLite cache for implicit chat creation

**Location**: `src/requester-app/src/src/lib/sqlite-message-cache.ts`

**Change**: `addMessage` should create sync state entry if none exists:

```typescript
// If chat_sync_state doesn't exist for this requestId, create it
// with state = UNKNOWN and set local_max_seq = message.sequenceNumber
```

---

### Phase 2: Missing-Messages-Only Sync

**Goal**: When OUT_OF_SYNC, fetch only missing messages, never full chat.

#### 2.1 Add sequence gap detection to `sqlite-message-cache.ts`

**New method**: `findMissingSequenceRanges(requestId)`

```typescript
interface SequenceGap {
  fromSeq: number;  // inclusive
  toSeq: number;    // inclusive
}

async findMissingSequenceRanges(requestId: string): Promise<SequenceGap[]> {
  // Query: SELECT sequence_number FROM messages WHERE request_id = ? ORDER BY sequence_number
  // Iterate and find gaps between consecutive sequences
  // Also detect if local_max_seq < last_known_backend_seq (trailing gap)
}
```

#### 2.2 Add partial fetch API to `messages.ts`

**Verify existing**: `getMessagesCursor` uses `beforeSequence` for older messages.

**New method needed**: `getMessagesInRange(requestId, fromSeq, toSeq)`

```typescript
// Backend endpoint: GET /chat/messages?request_id=X&from_seq=Y&to_seq=Z
// Returns messages where Y <= sequence_number <= Z
```

**If backend doesn't support**: Fall back to multiple cursor-based requests.

#### 2.3 Update `chat-sync-service.ts` resync logic

**Location**: `src/requester-app/src/src/lib/chat-sync-service.ts`

**Change `resync()` method**:

```typescript
async resync(requestId: string): Promise<void> {
  // 1. Find missing ranges
  const gaps = await sqliteMessageCache.findMissingSequenceRanges(requestId);

  if (gaps.length === 0) {
    // No gaps - just validate and update state
    await this.validateAndUpdateState(requestId);
    return;
  }

  // 2. Fetch only missing messages
  for (const gap of gaps) {
    const messages = await getMessagesInRange(requestId, gap.fromSeq, gap.toSeq);
    await messageCacheBridge.cacheMessages(requestId, messages, { merge: true });
  }

  // 3. Re-validate after sync
  await this.validateAndUpdateState(requestId);
}
```

---

### Phase 3: Skeleton UX for Missing History Only

**Goal**: Show skeleton only for missing older messages, not entire chat.

#### 3.1 Add `hasMissingOlderMessages` state to `use-chat-sync.ts`

```typescript
const hasMissingOlderMessages = createMemo(() => {
  const meta = syncMeta();
  if (!meta) return false;

  // Check if there are messages older than our cached range
  return meta.local_min_seq > 1;
});
```

#### 3.2 Update `ticket-chat.tsx` to show partial skeleton

**Location**: `src/requester-app/src/src/routes/ticket-chat.tsx`

**Change**: Instead of full `MessagesSkeleton` during sync:

```tsx
<Show when={hasMissingOlderMessages() && isSyncing()}>
  <div class="flex flex-col gap-2 p-4">
    {/* Compact skeleton for older messages being loaded */}
    <div class="text-xs text-muted-foreground text-center">
      Loading older messages...
    </div>
    <MessagesSkeleton compact={true} count={3} />
  </div>
</Show>

{/* Always render cached messages below */}
<For each={groupedMessages()}>
  {/* ... existing message rendering */}
</For>
```

---

### Phase 4: Resync Button Visibility Guard

**Goal**: Only show resync button when chat view is fully ready.

#### 4.1 Add `chatViewReady` signal to `ticket-chat.tsx`

```typescript
const [chatViewReady, setChatViewReady] = createSignal(false);

// Set to true after:
// 1. Messages container is mounted
// 2. Initial cache load complete
// 3. Initial scroll complete

createEffect(() => {
  if (messagesContainerRef && !isHydrating() && initialScrollDone()) {
    setChatViewReady(true);
  }
});
```

#### 4.2 Guard resync button visibility

```tsx
<Show when={chatViewReady()}>
  <Button onClick={handleResync} disabled={isSyncing()}>
    <RefreshCw class={isSyncing() ? 'animate-spin' : ''} />
  </Button>
</Show>
```

---

### Phase 5: Sync Indicator Cleanup

**Goal**: Only show indicator during actual fetch, not validation.

#### 5.1 Separate `isFetching` from `isSyncing` in chat-sync-service

```typescript
// Current: single isSyncing state
// New:
//   - isValidating: checking sequences (no UI indicator)
//   - isFetching: actively downloading messages (show indicator)
```

#### 5.2 Update UI to use `isFetching` only

```tsx
<Show when={isFetching()}>
  <span class="text-xs text-muted-foreground flex items-center gap-1">
    <Loader2 class="h-3 w-3 animate-spin" />
    Syncing...
  </span>
</Show>
```

---

## Backend Requirements

### Verify or Implement: Partial Message Fetch

**Required endpoint behavior**:

```
GET /chat/messages?request_id=X&from_seq=Y&to_seq=Z

Response:
- Messages where Y <= sequence_number <= Z
- Ordered by sequence_number ASC
```

**Alternative if not available**: Use multiple cursor-based requests to fill gaps.

---

## Testing Strategy

### Unit Tests
- `sqlite-message-cache.ts`: Test `findMissingSequenceRanges` with various gap patterns
- `chat-sync-service.ts`: Test resync with partial gaps, full gaps, no gaps

### Integration Tests
- Simulate incoming message when chat is closed → verify cache
- Open chat with partial cache → verify only missing messages fetched
- Manual resync → verify incremental behavior

### E2E Scenarios
1. Fresh app start with notification → open chat → see cached message + sync older
2. Chat open, receive message → no duplicate, no resync
3. Offline period → reconnect → sync only new messages
4. Corrupt cache → force full resync (edge case)

---

## Commit Boundaries

1. **Commit 1**: Cache incoming messages in notification handler
2. **Commit 2**: Add sequence gap detection to SQLite cache
3. **Commit 3**: Implement partial fetch API (or verify backend support)
4. **Commit 4**: Update resync to use incremental logic
5. **Commit 5**: Skeleton UX for missing history only
6. **Commit 6**: Resync button visibility guard
7. **Commit 7**: Sync indicator cleanup
8. **Commit 8**: Tests and documentation

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Backend doesn't support range query | Use cursor pagination with skip logic |
| Race condition: message arrives during sync | Dedup by sequence number before insert |
| Large gaps cause many requests | Batch requests, add progress indicator |
| SQLite migration breaks cache | Migration phase 2 writes to both stores |
| Optimistic messages conflict with cache | Use `tempId` / `clientTempId` matching |

---

## Success Metrics

- **P50 chat open time**: < 100ms (from cache)
- **Sync bandwidth**: Reduced by 80%+ for partial syncs
- **User-reported "missing messages"**: Reduced to near-zero
- **Resync button clicks**: Baseline established, monitor for reduction
