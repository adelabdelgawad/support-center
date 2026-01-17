```markdown
## Task: Extend Cache System to Support Image Caching (Offline-Safe, Retry-Capable)

### Context
The application already caches **chat messages** locally (SQLite + IndexedDB).  
Chat messages may include **images (screenshots / attachments)** that are currently fetched from the server on demand.

This causes issues when:
- the app is offline
- the image was previously fetched but not cached
- the image does not exist on the server (404), causing repeated failed fetches

---

### Objective
Extend the existing cache system to **also cache images**, with correct handling for:
- successful image loads
- image not found (404)
- retrying failed images manually

This must work without changing chat sync or message logic.

---

### Hard Invariants
1. **Images must be cache-first**
   - If cached → render immediately
   - If not cached → fetch once, then cache result
2. **404 images must be cached as NOT_FOUND**
   - Prevent repeated failed requests
3. **Retry must be user-initiated**
   - No automatic retry loops
4. **Chat message behavior must not change**

---

### Scope
Allowed to modify:
- image fetch utilities
- cache schema (SQLite / IndexedDB)
- image rendering components

Do NOT modify:
- chat message sync logic
- SignalR logic
- ticket/chat ownership boundaries

---

### Required Design

#### 1. Image Cache Model
Add an image cache entry with fields similar to:

- `imageKey` (filename or hash)
- `requestId` (ticket/chat association)
- `status` → `CACHED | NOT_FOUND | ERROR`
- `blob | base64 | filePath` (when cached)
- `lastFetchedAt`
- `retryCount`

#### 2. Image Fetch Flow (Cache-First)
For each image render:
1. Check local image cache
2. If `status === CACHED` → render image
3. If `status === NOT_FOUND` → render placeholder + retry button
4. If not cached:
   - Fetch from server
   - On success → cache image + render
   - On 404 → cache `NOT_FOUND`
   - On network error → cache `ERROR`

---

### UI Requirements
- For `NOT_FOUND` or `ERROR` images:
  - Render a centered placeholder
  - Show a **Retry** button
- Retry button behavior:
  - Clears cached error entry
  - Re-attempts fetch once
  - Updates cache accordingly

---

### Offline Behavior
- Cached images must render offline
- `NOT_FOUND` images must NOT refetch automatically when offline
- Retry button should be disabled while offline

---

### Safety Constraints
- Do not refetch images unnecessarily
- Do not block chat rendering on image loading
- Avoid breaking existing image URLs or message schemas
- Treat schema changes as additive and backward-compatible

---

### Validation Checklist
- Images render instantly when cached
- Offline mode shows cached images correctly
- Missing images do NOT spam network requests
- Retry button successfully refetches when image becomes available
- No changes to chat message syncing behavior

---

### Deliverables
- Image cache extension (SQLite + IndexedDB if applicable)
- Cache-first image fetch implementation
- Retry-capable UI for failed images
- Minimal, production-safe changes

Proceed incrementally and verify behavior with offline testing.
```
