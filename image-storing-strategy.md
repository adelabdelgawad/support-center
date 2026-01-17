```markdown
## Task: Migrate Image Caching from SQLite Blobs to Filesystem-Based Storage (Production-Safe)

### Background
The current implementation stores image binary data inside `image_cache.db` using a blob/base64 column (e.g. `v64_delta`).  
This causes database bloat and violates the intended architecture.

**Target architecture:**
- SQLite → metadata & index only
- Filesystem → actual image bytes
- Backward compatible
- No changes to chat/message sync behavior

---

### Hard Rules (Must Be Enforced)
1. **SQLite must NEVER store image binary data**
   - No blobs
   - No base64
   - No deltas
2. **All image bytes must be written to the filesystem**
3. **SQLite stores metadata only**
4. **Chat rendering must remain cache-first and non-blocking**
5. **No automatic re-fetch loops**

---

### Scope
Allowed to modify:
- Image cache schema
- Image fetch/write/read utilities
- Image rendering components

Do NOT modify:
- Chat message sync logic
- SignalR logic
- Ticket/chat ownership boundaries

---

### Required Architecture

#### 1. Filesystem Image Store
Create a dedicated directory:
```

%APPDATA%/supportcenter.requester/images/

```

Each image must be stored as a file using a deterministic name:
- Prefer content hash or server filename
- One file per image

---

#### 2. SQLite Image Index (Metadata Only)
Refactor `image_cache.db` to store ONLY:

- `image_key` (primary key)
- `request_id`
- `file_path` (relative path under images/)
- `status` → `CACHED | NOT_FOUND | ERROR`
- `mime_type`
- `file_size`
- `last_fetched_at`
- `retry_count`

**Explicitly remove / deprecate:**
- `v64_delta`
- any blob/base64 columns

---

#### 3. Backward-Compatible Migration
On app startup or image access:

- Detect legacy rows with blob data
- For each legacy entry:
  1. Decode blob/base64
  2. Write image to filesystem
  3. Update SQLite row:
     - set `file_path`
     - clear blob fields
     - mark `status = CACHED`
- Migration must be incremental and non-blocking
- Do NOT re-fetch from network during migration

---

#### 4. Image Fetch Flow (Cache-First)
For each image render:

1. Lookup image metadata in SQLite
2. If `status === CACHED` and file exists:
   - Load from filesystem
3. If `status === NOT_FOUND`:
   - Render placeholder + retry button
4. If no entry:
   - Fetch image once from server
   - On success:
     - write file
     - insert metadata row
   - On 404:
     - insert metadata row with `NOT_FOUND`
   - On network error:
     - insert metadata row with `ERROR`

---

#### 5. Retry Behavior
- Retry is **manual only**
- Retry clears previous metadata entry
- Re-attempts fetch once
- Updates metadata accordingly
- Disabled while offline

---

### Safety Constraints
- No schema-breaking deletions without migration
- No blocking UI during migration
- No background retries
- Preserve existing message/image references

---

### Validation Checklist
- SQLite DB size decreases over time
- No image blobs remain in SQLite
- Cached images render offline
- Missing images do not refetch automatically
- Retry button works correctly
- Chat behavior unchanged

---

### Deliverables
- Filesystem-backed image storage
- SQLite metadata-only image index
- Safe migration from blob-based storage
- Minimal, production-safe changes

Proceed incrementally and verify each step before moving forward.
```
