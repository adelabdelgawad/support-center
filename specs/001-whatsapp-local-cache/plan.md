# Implementation Plan: WhatsApp-Style Local Cache & Media Architecture

**Branch**: `001-whatsapp-local-cache` | **Date**: 2026-01-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-whatsapp-local-cache/spec.md`

## Summary

Implement a WhatsApp-style local caching system for the Support Desk Center chat functionality across both client applications (IT App - Next.js browser, and Requester App - Tauri desktop). The system will cache messages and media locally using IndexedDB (browser) and file system storage (desktop), implement delta synchronization to reduce backend load by 80%+, enable offline message composition with automatic retry, and provide virtualized rendering for large chat histories.

## Technical Context

**Language/Version**:
- Backend: Python 3.12+ (FastAPI)
- IT App: TypeScript 5.x (Next.js 15, React 19)
- Requester App: TypeScript 5.x (SolidJS) + Rust (Tauri v2)

**Primary Dependencies**:
- Backend: FastAPI, SQLModel, asyncpg, redis-py
- IT App: Next.js 15, React 19, SWR, @microsoft/signalr, idb (IndexedDB wrapper), @tanstack/react-virtual
- Requester App: SolidJS, Tauri v2, @tanstack/solid-virtual, idb-keyval

**Storage**:
- Backend: PostgreSQL (existing), Redis (existing), MinIO (existing)
- IT App: IndexedDB (browser, 100MB limit)
- Requester App: %APPDATA%\supportcenter.requester (Windows, 500MB limit) via Tauri fs plugin + IndexedDB

**Testing**:
- Backend: pytest
- IT App: vitest, playwright
- Requester App: vitest, tauri-driver

**Target Platform**:
- IT App: Modern browsers (Chrome, Firefox, Edge, Safari)
- Requester App: Windows 10+ (Tauri desktop)

**Project Type**: Web + Desktop (multi-platform)

**Performance Goals**:
- Cache load: <100ms
- Delta sync (100 messages): <200ms
- Scroll: 60 FPS with 5000+ messages
- Media cache hit rate: >90%

**Constraints**:
- IT App browser cache: 100MB max
- Desktop app cache: 500MB max
- Memory with 10k messages: <50MB
- App startup with cache: <2 seconds

**Scale/Scope**:
- Messages per chat: up to 10,000 cached
- Concurrent chats: unlimited (LRU eviction)
- Offline queue: up to 100 messages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. HTTPSchemaModel Inheritance | ✅ PASS | Backend delta sync endpoints will use HTTPSchemaModel for request/response schemas |
| II. API Proxy Pattern | ✅ PASS | IT App will call Next.js API routes (/api/chat/*) which proxy to FastAPI backend |
| III. Bun Package Manager | ✅ PASS | All it-app commands will use bun (bun install, bun run dev, etc.) |
| IV. Service Layer Architecture | ✅ PASS | New sync endpoints will delegate to ChatService; no business logic in endpoints |
| V. Clean Code Removal | ✅ PASS | No legacy code patterns; fresh implementation of cache layer |

**Pre-Phase 0 Gate**: ✅ PASSED - All principles satisfied

## Project Structure

### Documentation (this feature)

```text
specs/001-whatsapp-local-cache/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── delta-sync-api.yaml
│   └── cache-schema.ts
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Backend (FastAPI)
src/backend/
├── api/v1/endpoints/
│   └── chat.py                    # Add delta sync endpoints
├── repositories/
│   └── chat_repository.py         # Add range query methods
├── services/
│   └── chat_service.py            # Add delta sync logic
└── schemas/chat_message/
    └── chat_message.py            # Add sync-related schemas

# IT App (Next.js)
src/it-app/
├── lib/
│   └── cache/
│       ├── db.ts                  # IndexedDB wrapper
│       ├── message-cache.ts       # Message cache service
│       ├── media-manager.ts       # Media cache service
│       ├── sync-engine.ts         # Delta sync engine
│       └── schemas.ts             # Shared cache types
├── lib/signalr/
│   └── signalr-manager.ts         # Integrate cache writes
└── app/(it-pages)/support-center/
    └── requests/(details)/[id]/
        └── _components/
            └── virtualized-message-list.tsx  # New component

# Requester App (Tauri + SolidJS)
src/requester-app/
├── src/src/lib/
│   ├── message-cache.ts           # Extend existing cache
│   ├── sync-engine.ts             # New sync engine
│   └── media-manager.ts           # New media manager
├── src/src/components/
│   └── settings/
│       └── cache-settings.tsx     # New settings panel
└── src-tauri/
    └── src/
        └── cache_storage.rs       # Rust file system cache
```

**Structure Decision**: Web + Desktop multi-platform architecture. Backend changes are minimal (add delta sync parameters). Frontend changes are parallel implementations for browser (IndexedDB) and desktop (Tauri fs + IndexedDB).

## Complexity Tracking

No constitution violations requiring justification.

---

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Verification |
|-----------|--------|--------------|
| I. HTTPSchemaModel Inheritance | ✅ PASS | No new backend schemas required; existing ChatMessageRead already uses HTTPSchemaModel |
| II. API Proxy Pattern | ✅ PASS | IT App cache calls `/api/chat/*` routes, never backend directly |
| III. Bun Package Manager | ✅ PASS | quickstart.md specifies `bun add idb @tanstack/react-virtual` |
| IV. Service Layer Architecture | ✅ PASS | Delta sync logic in ChatService, endpoint is thin wrapper |
| V. Clean Code Removal | ✅ PASS | New implementation, no deprecated patterns |

**Post-Phase 1 Gate**: ✅ PASSED

---

## Generated Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | `specs/001-whatsapp-local-cache/research.md` | ✅ Complete |
| Data Model | `specs/001-whatsapp-local-cache/data-model.md` | ✅ Complete |
| API Contract | `specs/001-whatsapp-local-cache/contracts/delta-sync-api.yaml` | ✅ Complete |
| Cache Schema | `specs/001-whatsapp-local-cache/contracts/cache-schema.ts` | ✅ Complete |
| Quickstart | `specs/001-whatsapp-local-cache/quickstart.md` | ✅ Complete |

---

## Next Steps

Tasks have been generated. Run `/speckit.implement` to begin implementation.

See: [tasks.md](./tasks.md)
