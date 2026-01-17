````markdown
# Task: Make Tickets Page Strictly Cache-First and Stop All Chat Over-Fetching

## Context
Current logs confirm:
- Tickets page already has valid cached data:
  - last message
  - unread counts
  - chatMessagesCount
- Despite this, the app still:
  - fetches `/chat/messages`
  - updates backend sequence for many tickets
  - writes chat messages into SQLite
- This causes unnecessary requests, heavy SQLite queues, and no visible UX improvement.

Chat page behavior is already correct and MUST NOT be changed.

---

## Objective
Refactor **Tickets Page ONLY** so it is:
- Fully offline-capable
- Strictly cache-first
- Read-only with respect to chats

Tickets page must **never** trigger chat sync, message fetch, or message cache writes.

---

## Hard Invariants (Must Be Enforced)
- Tickets page:
  - ❌ MUST NOT fetch chat messages
  - ❌ MUST NOT call `/chat/messages`
  - ❌ MUST NOT call `cacheMessages`
  - ❌ MUST NOT call `updateBackendSeq`
  - ❌ MUST NOT invoke `ChatSyncService`
- Chat page remains the ONLY place where:
  - messages are fetched
  - messages are cached
  - backend sequence is updated
  - sync/validation occurs

---

## Required Changes

### 1. Enforce Responsibility Boundary
Audit all tickets-related files (components, hooks, queries).

Ensure tickets page ONLY reads:
- ticket list
- unread count
- last message preview
- cached message count (metadata only)

Add explicit comments documenting this boundary.

---

### 2. Block Chat Message Fetches at Tickets Level
Locate any code that:
- builds request keys like `messages:{ticketId}`
- calls `/chat/messages`
- uses pagination params (`page`, `limit`, `after_message_id`)
- implicitly fetches messages to compute unread state

Remove or hard-block it.

Add a defensive guard:
```ts
if (isTicketsPage) {
  console.error("[TicketsPage] Chat message fetch attempted — blocked");
  return;
}
````

---

### 3. Prevent Message Cache Writes from Tickets Page

Ensure none of the following are reachable from tickets flow:

* `MessageCacheBridge.cacheMessages`
* `SQLiteMessageCache.cacheMessages`

Tickets page must never write chat messages to cache.

---

### 4. Fix Cache Decision Logic

If tickets page detects:

```ts
hasCachedData === true
```

Then it MUST:

* skip all chat-related HTTP requests
* skip sync logic entirely
* skip backend sequence updates

This decision must happen early (before queries fire).

---

### 5. Stop Backend Sequence Update Storm

Guard `updateBackendSeq(ticketId)` so it runs ONLY when:

* current route is chat page
* `ticketId === activeChatId`

Example guard:

```ts
if (!isChatRoute || ticketId !== activeChatId) return;
```

Tickets page must never trigger backend sequence updates.

---

### 6. Validation & Proof

Add temporary logs to verify behavior:

* On tickets page mount:

  * log that cache is used
  * log that no chat fetch will occur
* If any chat message fetch is attempted from tickets:

  * log error with stack trace

Expected outcome:

* ZERO `/chat/messages` calls on tickets page
* ZERO SQLite chat writes on tickets load
* SQLite queue remains idle
* Tickets page works fully offline
* Chat behavior unchanged

---

## Constraints

* Incremental changes only
* No schema changes
* No new endpoints
* No refactor of chat sync logic
* Preserve existing chat functionality

```
```
