# Implementation Plan: Remote Support Auto-Start with User Awareness

**Branch**: `004-remote-support-auto-start` | **Date**: 2026-01-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-remote-support-auto-start/spec.md`

## Summary

Add a persistent, non-dismissable top banner to the requester desktop application (Tauri + SolidJS) that displays when a remote support session is active. The banner shows "Remote support session active" with the IT agent's username. The current system already auto-starts sessions without user approval - this feature adds the missing user awareness indicator. Backend changes add audit logging for session events.

## Technical Context

**Language/Version**: Python 3.12+ (Backend), TypeScript 5.x (Requester App)
**Primary Dependencies**: FastAPI, SQLModel, Tauri v2, SolidJS, SignalR
**Storage**: PostgreSQL (session records already exist)
**Testing**: pytest (backend), manual testing (Tauri app)
**Target Platform**: Windows desktop (Tauri), Linux server (FastAPI)
**Project Type**: Web application with desktop client
**Performance Goals**: Indicator appears within 1 second of session start, removed within 2 seconds of session end
**Constraints**: Banner must persist across all navigation, cannot be dismissed by user
**Scale/Scope**: Single desktop app component, minimal backend logging addition

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. HTTPSchemaModel Inheritance | N/A | No new backend schemas required |
| II. API Proxy Pattern | N/A | No new it-app API calls (requester-app uses SignalR directly) |
| III. Bun Package Manager | N/A | Changes are in requester-app (uses npm), not it-app |
| IV. Service Layer Architecture | PASS | Audit logging added to existing service |
| V. Clean Code Removal | PASS | No legacy code being removed |

**Result**: All applicable gates PASS. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-remote-support-auto-start/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no new API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/backend/
├── services/
│   └── remote_access_service.py    # Add audit logging (FR-011)
└── api/v1/endpoints/
    └── remote_access.py            # Existing endpoints (no changes needed)

src/requester-app/src/src/
├── components/
│   └── remote-session-banner/      # NEW: Banner component
│       ├── RemoteSessionBanner.tsx # Visual indicator component
│       └── remote-session-banner.css
├── stores/
│   └── remote-access-store.ts      # Update to expose session state for banner
├── signalr/
│   └── signalr-manager.ts          # Already handles session events (no changes)
└── App.tsx                         # Mount banner at app root level
```

**Structure Decision**: Web application with desktop client. Changes span backend (audit logging) and requester-app (UI banner). The it-app (agent portal) requires no changes.

## Complexity Tracking

> No constitution violations. Table not needed.
