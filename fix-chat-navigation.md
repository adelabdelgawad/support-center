```markdown
## Task: Eliminate Chat Message Fetch Leak from Tickets Page (Route-Safe, Production-Safe)

### Context
The application enforces a strict architectural invariant:

> **Chat messages must NEVER be fetched unless the active route is the chat page.**

This invariant is already enforced at runtime and currently logs:
```

[INVARIANT VIOLATION] Chat message fetch attempted outside chat route

```

Logs confirm that **`queries/tickets.ts` indirectly triggers `getMessagesCursor`**, causing chat message fetches while the Tickets page is mounted.  
This behavior existed before but is now correctly exposed by guards.

The chat page behavior itself is correct and MUST NOT be changed.

---

### Objective
Safely eliminate **all chat-message fetches originating from the Tickets page**, without breaking:
- unread count logic
- ticket list rendering
- offline/cache-first behavior
- chat page syncing logic

---

### Hard Invariants (Must Be Enforced)
1. **Tickets page MUST NEVER call:**
   - `getMessagesCursor`
   - `fetchMessagesCursor`
   - any `/chat/messages/*` HTTP endpoint
2. **Only the Chat route may fetch chat messages**
3. **Unread counts and ticket metadata MUST rely on cache-only data**
4. **Chat page behavior must remain unchanged**

---

### Scope of Changes
Limit changes strictly to:
- `queries/tickets.ts`
- any helper/hooks/functions used by Tickets queries

Do NOT modify:
- chat route components
- chat sync service
- message cache service
- SignalR chat logic

---

### Required Actions
1. **Trace and identify** the exact code path in `queries/tickets.ts` (or its helpers) that calls message APIs.
2. **Remove or refactor** this dependency so that:
   - Tickets queries operate ONLY on:
     - ticket cache
     - unread counters
     - backend ticket metadata
   - No message cursor or message fetch logic is reachable.
3. If unread counts currently depend on message fetches:
   - Replace with cache-derived counts or precomputed ticket-level fields.
4. Ensure request deduplication keys related to messages are **never registered** by tickets queries.

---

### Safety Constraints
- Preserve existing behavior and data contracts.
- Treat deletions as high-risk: remove code only if it is provably unused by chat routes.
- Do not introduce polling.
- Do not introduce new backend calls.
- No speculative refactors.

---

### Validation Checklist (Must Pass)
- Opening Tickets page produces **zero** `/chat/messages/*` requests.
- No `[INVARIANT VIOLATION]` logs during Tickets page lifecycle.
- Chat page still:
  - renders from cache first
  - performs background HTTP validation
  - connects to SignalR correctly
- Unread counts remain correct (online & offline).

---

### Deliverables
- Minimal, well-scoped code changes
- Clear separation of ownership:
  - Tickets → metadata only
  - Chat → messages only
- Updated code that enforces the invariant structurally (not just by guards).

Proceed incrementally and verify before modifying behavior.
```
