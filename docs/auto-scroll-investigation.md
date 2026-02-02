# Auto-Scroll Logic: Investigation Report & Change Guide

## Current Behavior Summary

All chat auto-scroll logic lives in **one component** with **two context layers** wiring it up:

### Authoritative Files
| File | Role |
|------|------|
| `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/ticket-messages.tsx` | **All scroll logic** (lines 50-550) |
| `.../_context/request-detail-chat-context.tsx` | Calls scroll handlers on WebSocket events (lines 130, 168) |
| `.../_context/request-detail-metadata-context.tsx` | Holds scroll handler refs + registration functions (lines 296-305) |
| `.../_context/request-detail-context.tsx` | Creates refs, passes to chat context (lines 113-114) |

### Scroll Triggers (4 total)

| # | Trigger | Function | Smooth? | Forced? | Conditional? |
|---|---------|----------|---------|---------|--------------|
| 1 | **Chat opens / messages load** | `performInitialScroll` (line 140) | No (instant) | Yes | Once per chat session; retries up to 15x if DOM not ready; waits for images |
| 2 | **WebSocket new message** | `handleNewMessageScroll` (line 375) | Yes | No | Only if user is within 50px of bottom (`isOnBottomRef`) |
| 3 | **User sends message** | `handleForceScrollToBottom` (line 401) | Yes | Yes | Always scrolls |
| 4 | **Image finishes loading** | `handleImageLoad` (line 300) | No (instant) | No | Only if at bottom AND image belongs to latest message |

### Supporting Mechanisms
- **`isOnBottom` tracking**: `handleScroll` (line 247) — RAF-debounced scroll listener checks `distanceFromBottom <= 50px`
- **Programmatic scroll guard**: `isScrollingProgrammaticallyRef` prevents scroll handler from reacting to its own scrolls
- **New message badge**: `newMessagesWhileScrolledUp` counter shown on floating button when user is scrolled up
- **Floating button** (line 528): Visible when `!isOnBottom`, click force-scrolls to bottom

### No Duplication or Conflicts Found
- Single source of truth in `TicketMessages`
- Context layers only hold refs and invoke them — no independent scroll logic
- No `scrollIntoView`, no intersection observers, no SWR-triggered scrolls

---

## Change Options

### Option A: Disable auto-scroll entirely
**Change:** In `scrollToBottom`, return early unconditionally (or remove handler registrations in lines 423-433).
**Risk:** Low. Users would need the floating button to see new messages. Badge counter still works.

### Option B: Scroll only if user is already at bottom (current behavior for WebSocket messages)
**Status:** Already implemented for trigger #2. Triggers #1 and #3 are intentionally forced.
**To extend to #3 (user sends message):** Change `handleForceScrollToBottom` (line 403) from `force=true` to `force=false`.

### Option C: Scroll only on messages sent by current user
**Change:** In `handleNewMessageScroll` (line 375), add a parameter for `isCurrentUser` from the chat context's `onNewMessage` callback and gate the scroll call.
**Risk:** Medium — requires plumbing the sender identity from SignalR through the ref callback.

### Option D: Debounce/throttle scroll frequency
**Change:** Add a timestamp ref in `scrollToBottom`; skip if called within N ms of last scroll. Already partially handled by the 500ms programmatic scroll timeout (line 238).
**Risk:** Low. Could cause missed scrolls if messages arrive in rapid bursts.

---

## Risk Notes

| Area | Risk Level | Detail |
|------|-----------|--------|
| Remove `performInitialScroll` | **High** | Chat would open at top of history instead of bottom — very disorienting |
| Remove `handleForceScrollToBottom` | **Medium** | User sends message but can't see it if scrolled up — confusing UX |
| Remove `handleNewMessageScroll` | **Low** | Already conditional; removing just means no auto-scroll on incoming messages |
| Remove image load scroll | **Low** | Minor visual glitch — chat might not adjust after image renders |
| Modify `SCROLL_THRESHOLD` constant | **Low** | Just changes sensitivity of "at bottom" detection |
| Change smooth→instant or vice versa | **Low** | Cosmetic only |

---

## No Code Changes in This Document
This is a read-only investigation deliverable. Implementation would be a follow-up task.
