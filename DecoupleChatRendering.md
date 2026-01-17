````markdown
# Task: Decouple Chat Rendering from Sync and Enforce Cache-First Chat Open Flow

## Context & Assumptions
- This is a **production system**.
- Chat messages are persisted locally in SQLite.
- SignalR is used for **live messages only**.
- HTTP is used for **history fetch, validation, and repair only**.
- Existing cache, partial sync, and offline strategies must be preserved.
- The current issue: chats re-trigger HTTP/SignalR gating on reopen, causing delayed rendering even when cache exists.

---

## High-Level Goal
Fix the chat open lifecycle so that:
- Cached messages render **immediately** when available
- SignalR and HTTP sync run **strictly in the background**
- No cached chat ever waits for SignalR or HTTP before rendering
- Incremental HTTP sync is skipped when cache is already up to date
- Live messages are never lost during validation or repair

---

## Core Rules (Must Be Enforced)

### Rule 1: Cache Is the UI Source of Truth
- If cached messages exist for a chat:
  - Render them immediately
  - Do NOT wait for SignalR
  - Do NOT wait for HTTP
  - Do NOT gate rendering on sync state

Rendering must depend ONLY on:
- `getCachedMessages(chatId)`

---

### Rule 2: SignalR Must Never Block Rendering
When a chat is opened:
1. Start SignalR connection immediately (fire-and-forget).
2. Register SignalR handlers immediately.
3. Do NOT await SignalR readiness for any UI or HTTP logic.

SignalR is append-only and best-effort live delivery.

---

### Rule 3: HTTP Sync Is Background-Only
HTTP sync must:
- Never block UI rendering
- Never clear or reset messages
- Only merge new or missing messages after render
- Only update sync indicators / metadata

UI must already be visible before any HTTP request completes.

---

## Correct Chat Open Flow (Required)

When a chat is opened:

1. **Read from SQLite**
   - Load cached messages
   - Render immediately if any exist

2. **Start SignalR**
   - Do not await connection
   - Deduplicate messages later if needed

3. **Decide Whether HTTP Sync Is Needed**
   Perform this check AFTER rendering:

   Skip HTTP sync if ALL are true:
   - Cached messages exist
   - Cached last_message_id is known
   - Ticket list last_message_id === cached last_message_id
   - Last sync state was SYNCED

   If skipped:
   - Mark chat as `SYNCED_FROM_CACHE`
   - Do nothing else

4. **If HTTP Sync Is Needed**
   - Run in background
   - Call:
     ```
     GET /messages?chat_id=...&after_message_id=<cached_last_id>
     ```
   - Merge returned messages
   - Deduplicate against SignalR messages
   - Update cache and UI incrementally

---

## Incremental HTTP Sync Rules

- HTTP is authoritative for history repair only
- Backend returns:
  - empty list if `after_message_id` is latest
  - all messages after the provided ID otherwise
- Never reload full chat by default
- Never clear cache during HTTP sync

---

## Validation & Repair Phase (Background)

After HTTP incremental sync:
- Validate message continuity (best-effort, UUID-based)
- If inconsistency is suspected:
  - Identify last known consistent message
  - Request missing messages via HTTP using `after_message_id`
- Repeat until stable or backend returns empty

SignalR remains active throughout.

---

## Deduplication Rules

- Deduplicate messages by message UUID
- Handle cases where:
  - SignalR message arrives during HTTP sync
  - HTTP returns messages already received via SignalR
- Never drop messages due to timing conflicts

---

## Lifecycle Guards (Critical Fix)

Ensure chat open logic:
- Runs **once per chat open**
- Does NOT re-run fully on:
  - React remount
  - state updates
  - navigation re-renders

Add guards keyed by:
- `chat_id`
- session / navigation instance

---

## What Must Be Removed or Refactored

- ❌ Waiting for SignalR before rendering
- ❌ Waiting for SignalR before HTTP sync
- ❌ Treating chat open as a sync operation
- ❌ Blocking UI on validation
- ❌ Re-running full open logic on remount

---

## Constraints
- Do NOT change message ID type (UUID remains)
- Do NOT introduce full history reloads by default
- Do NOT change existing cache schema unless required
- Preserve existing offline behavior
- Keep changes incremental and production-safe

---

## Validation Checklist
- [ ] Cached chats render instantly on second open
- [ ] No HTTP request is required to show cached messages
- [ ] SignalR never blocks UI
- [ ] HTTP sync runs only when necessary
- [ ] No duplicate messages from HTTP + SignalR
- [ ] Second app launch feels instant for cached chats
- [ ] Existing sync and cache behavior remains intact

---

## Deliverables
- Refactor chat open lifecycle to follow the above flow
- Add logging to prove render happens before network
- Keep code readable, minimal, and stable
````
