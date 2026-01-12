```markdown
# Task: Implement Local Image Caching with Blurred Thumbnails (WhatsApp-like) For the Requester Application 

## Context
We need to implement a **local image storage and caching system** for chat images to avoid repeatedly fetching images from the server. The behavior and UX must closely resemble **WhatsApp-style image handling**, including graceful recovery when local files are manually deleted by the user.

The application already has a defined local storage base directory:
- **Local storage root:** `%APPDATA%\supportcenter.requester`

This is a **production system**. All changes must be incremental, safe, backward-compatible, and thoroughly validated.

---

## Core Principles (Must Be Enforced)
- **Server metadata is the source of truth**
- **Local storage is a volatile cache**
- Local image files may disappear at any time and must never be blindly trusted
- Missing local files are a **normal cache miss**, not an error condition

---

## High-Level Goals
1. Cache chat images locally instead of always loading them from the server
2. Display **low-quality blurred thumbnails** immediately
3. Allow manual download of full images when not cached
4. Automatically download images when received while a chat is open
5. Persist sent images immediately to UI and local storage
6. Track cached images and recover safely if local files are deleted
7. Allow users to enable/disable this behavior via a **Settings switch**

---

## 1. Image Storage Architecture
- Use `%APPDATA%\supportcenter.requester` as the base directory
- Define a structured layout (example, adjust if needed):

  images/
    └── chats/
        └── <chat_id>/
            └── <image_id>/
                ├── full.jpg
                └── thumb.jpg
- Never hardcode paths
- All path resolution must go through a centralized storage utility

---

## 2. Image Metadata & Cache Tracking (Critical)
Introduce or extend image metadata storage (DB or local index file):

**Required fields**
- `image_id`
- `chat_id`
- remote image reference (URL or server ID)
- `is_cached` (boolean)
- local paths (full + thumbnail)
- `last_verified_at`
- optional but preferred: checksum / hash, file size

**Rules**
- Metadata may exist even if local files are missing
- Metadata must never be deleted automatically because files are missing
- Local files are considered **volatile**

---

## 3. Critical Algorithm: Handling Manually Deleted Local Images
This algorithm must be explicitly implemented and followed everywhere images are accessed.

### Detection (Lazy, On-Demand Only)
Validation must occur when:
- A chat is opened
- An image scrolls into view
- A user taps an image
- Auto-download logic is triggered

### Validation Steps
For any image with `is_cached = true`:
1. Check existence of:
   - `full.jpg`
   - `thumb.jpg`
2. Optionally validate:
   - minimum file size
   - checksum/hash match

### State Resolution
| Condition | Resulting State |
|--------|----------------|
| Full + thumb exist | Cached |
| Thumb exists, full missing | Partially cached |
| Both missing | Not cached |
| Corrupt / unreadable | Not cached |

### Mandatory State Transition
If a missing or invalid file is detected:
- Update metadata:
  is_cached = false
  last_verified_at = now()

- Do **not** throw
- Do **not** log as warning or error
- Treat as a normal cache miss

---

## 4. Receiving Images (Incoming)
### Chat Open
If:
- Chat is currently open
- `Local Storage Images = ON`

Then:
- Automatically download:
  - Full image
  - Blurred thumbnail
- Persist immediately to local storage
- Update metadata to cached

### Chat Closed
- Store metadata only
- Generate or fetch blurred thumbnail
- UI shows thumbnail + download button

---

## 5. Sending Images (Outgoing)
When a user sends an image:
- Immediately:
  - Display image in chat UI
  - Save full image to local storage
  - Generate and save blurred thumbnail
- Upload to server asynchronously
- UI must **not wait** for server confirmation

---

## 6. UI / UX Behavior
- Default rendering:
  - Always show blurred thumbnail first
- If full image is cached:
  - Replace thumbnail automatically
- If not cached:
  - Show download button centered on thumbnail
- While downloading:
  - Show loading/progress indicator
- After download:
  - Seamless replacement with full image
- If local files were deleted:
  - UI must gracefully fall back to thumbnail/download state

---

## 7. Auto-Recovery Rules After Deletion
If local files were deleted manually:
- The app must:
  - Detect missing files lazily
  - Mark image as not cached
  - Fall back to thumbnail + download
- If:
  - Chat is open
  - Local Storage Images = ON
  
  → Automatically re-download missing images
- If Local Storage Images = OFF:
  - Require explicit user download

---

## 8. Settings: Local Storage Images
Add a settings switch:
- Label: **Local Storage Images**

### Behavior
- **Enabled (default):**
  - Enable caching
  - Enable auto-download
- **Disabled:**
  - Do not store new images locally
  - Do not auto-download incoming images
  - Allow manual loading from server

### Constraints
- Switching OFF:
  - Must not delete existing local files
- Switching ON:
  - Must resume caching cleanly

---

## 9. Performance & Safety Constraints
- Thumbnails must be:
  - Very low resolution
  - Strongly blurred
  - Minimal disk footprint
- All IO and image processing must be async/backgrounded
- Validate disk availability and permissions before writing
- Fail gracefully on:
  - Missing directories
  - Disk full
  - Permission errors

---

## 10. Logging & Observability
- Missing local files:
  - Log as `INFO` or `DEBUG`
  - Never `WARN` or `ERROR`
- Example:

  Image cache miss detected (image_id=abc123), falling back to remote

---

## 11. Code Structure & Responsibilities
Introduce or extend:
- `imageStorageService`  
  - path resolution
  - save/load/delete
- `imageCacheTracker`  
  - metadata
  - validation
  - state transitions
- `thumbnailGenerator`  
  - blur
  - compression
- UI must never access filesystem directly

---

## 12. Validation Checklist
- Images are not re-fetched once cached
- Thumbnails load instantly
- Full images load only when cached or explicitly downloaded
- Manual deletion of files does not break chats
- Auto-recovery works when enabled
- Disabling the setting fully stops caching
- No crashes, blocking IO, or data loss

---

## 13. Explicit Non-Goals
- Do NOT auto-delete user files
- Do NOT scan entire storage on startup
- Do NOT migrate or re-download old images automatically
- Do NOT break existing chat APIs

---

## Deliverables
- Step-by-step implementation plan
- List of affected modules/files
- Data flow explanation for:
  - Incoming images
  - Outgoing images
  - Cache validation & recovery
- Risk analysis for production rollout

Proceed carefully. Investigate existing image handling and storage behavior before modifying anything.
```