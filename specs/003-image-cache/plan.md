# Implementation Plan: Local Image Caching with Blurred Thumbnails

**Branch**: `003-image-cache` | **Date**: 2026-01-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-image-cache/spec.md`

## Summary

Implement a WhatsApp-style local image caching system for the Requester Application (Tauri + SolidJS desktop app). The system will:
- Display blurred Base64 thumbnails instantly from message metadata
- Cache full images locally in `%APPDATA%\supportcenter.requester\images\`
- Auto-download images when chat is active, manual download otherwise
- Generate thumbnails locally for outgoing images before upload
- Provide storage management with 500MB soft limit and selective clearing

## Technical Context

**Language/Version**: TypeScript 5.4+, Rust (Tauri backend)
**Primary Dependencies**: Tauri v2, SolidJS 1.8, @tauri-apps/plugin-store, @microsoft/signalr 10.0
**Storage**: Tauri Plugin Store (persistent key-value), File System (`%APPDATA%\supportcenter.requester\images\`)
**Testing**: Vitest (not yet configured - NEEDS SETUP)
**Target Platform**: Windows Desktop (Tauri v2)
**Project Type**: Desktop application (Tauri + SolidJS frontend)
**Performance Goals**: <100ms thumbnail display, <200ms sent image display, non-blocking UI
**Constraints**: 500MB cache soft limit, offline-capable image viewing, async I/O only
**Scale/Scope**: Single user, ~100s of images per chat, ~50 active chats

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies | Status | Notes |
|-----------|---------|--------|-------|
| I. HTTPSchemaModel Inheritance | NO | N/A | This feature is frontend-only (Requester App). No backend schema changes required. Server already provides thumbnails in message metadata. |
| II. API Proxy Pattern | NO | N/A | Requester App is a Tauri desktop app, not Next.js. It calls backend directly via authenticated HTTP/SignalR. |
| III. Bun Package Manager | NO | N/A | Requester App uses npm (standard Node ecosystem), not it-app which uses bun. |
| IV. Service Layer Architecture | NO | N/A | No backend changes. Frontend-only feature in Requester App. |
| V. Clean Code Removal | YES | PASS | Will follow - no legacy code, no commented code. |

**Gate Status**: PASS - All applicable principles will be followed.

## Project Structure

### Documentation (this feature)

```text
specs/003-image-cache/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (internal contracts, no backend API changes)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/requester-app/src/src/
├── lib/
│   ├── storage.ts              # Existing - extend for image cache metadata
│   ├── notifications.ts        # Existing - extend for cache warning notifications
│   ├── image-cache/            # NEW - Image caching module
│   │   ├── index.ts            # Public API exports
│   │   ├── image-cache-service.ts      # Core caching logic
│   │   ├── image-storage.ts            # File system operations (Tauri FS)
│   │   ├── metadata-store.ts           # Cache metadata persistence
│   │   ├── thumbnail-generator.ts      # Client-side blur thumbnail for outgoing
│   │   └── cache-monitor.ts            # Size monitoring, warning triggers
│   └── ...
├── components/
│   ├── image-viewer.tsx        # Existing - enhance with cache-aware loading
│   ├── chat/                   # NEW - Chat image components
│   │   ├── chat-image.tsx      # Image with thumbnail/download/cached states
│   │   ├── image-download-button.tsx
│   │   └── image-progress.tsx
│   └── settings/               # NEW - Storage management UI
│       ├── storage-settings.tsx
│       ├── cache-usage-display.tsx
│       └── cache-clear-dialog.tsx
├── context/
│   └── image-cache-context.tsx # NEW - Cache state provider
├── routes/
│   └── settings.tsx            # Existing - extend with storage section
└── types/
    └── index.ts                # Existing - extend with cache types
```

**Structure Decision**: Desktop application pattern. All new code goes into the existing `src/requester-app/src/src/` structure. New `lib/image-cache/` module for core logic, new components for UI, extend existing settings page.

## Complexity Tracking

> No constitution violations requiring justification.

| Item | Decision | Rationale |
|------|----------|-----------|
| Separate image-cache module | Keep modular | Follows existing lib/ pattern (storage.ts, notifications.ts). Easier to test and maintain. |
| File system via Tauri | Required | Tauri apps access local FS through Rust backend, not browser APIs. |
| Metadata in Tauri Store | Reuse existing | Already have @tauri-apps/plugin-store for settings. No new dependencies needed. |
