# Implementation Plan: Fix Bidirectional Chat Text Rendering

**Branch**: `001-fix-bidi-chat` | **Date**: 2025-01-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-fix-bidi-chat/spec.md`

## Summary

Fix bidirectional text rendering in the chat interface where mixed Arabic/English messages display incorrectly. The issue is a text direction (RTL/LTR) handling problem at the UI layer. The solution applies the HTML `dir="auto"` attribute to message content containers, enabling browser-native Unicode Bidirectional Algorithm handling without backend changes or data transformation.

**Technical Approach**: Client-side only - add `dir="auto"` attribute to message text containers, ensure no conflicting CSS overrides direction, and preserve existing chat bubble alignment.

## Technical Context

**Language/Version**: TypeScript 5.x (React/Next.js frontend), Python 3.12+ (backend - no changes required)
**Primary Dependencies**: React 19, Next.js 15, Tailwind CSS 4 (UI only - no new dependencies)
**Storage**: N/A (UI-only fix, no data model changes)
**Testing**: Manual browser testing + visual regression tests for mixed-language messages
**Target Platform**: Web browsers (Chrome, Firefox, Safari, Edge) with RTL/LTR support
**Project Type**: web (it-app/ frontend only)
**Performance Goals**: Zero increase in page load time or rendering performance (SC-006)
**Constraints**: UI-only change, no backend modifications, no message data transformation, production-safe
**Scale/Scope**: Chat message rendering across all user roles (agents and employees)

### Key Technologies

- **Frontend**: Next.js 15 with App Router, React 19, Tailwind CSS 4, shadcn/ui
- **Chat Component Location**: `it-app/components/` (message display components)
- **WebSocket**: Real-time message delivery (no changes needed)
- **Direction Handling**: HTML `dir` attribute with Unicode Bidirectional Algorithm

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. HTTPSchemaModel Inheritance | ✅ PASS | No backend schemas changed - UI-only fix |
| II. API Proxy Pattern | ✅ PASS | No API calls added - display-only change |
| III. Bun Package Manager | ✅ PASS | If frontend deps added, must use `bun add` |
| IV. Service Layer Architecture | ✅ PASS | No backend changes - pure UI fix |
| V. Clean Code Removal | ⚠️ N/A | Adding code only, no removals needed |

**Gate Status**: ✅ ALL PASS - No violations to justify

**Re-check after Phase 1**: Will verify no unintended backend patterns were introduced

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-bidi-chat/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (N/A - no data changes)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
it-app/                                          # Next.js frontend
├── app/
│   └── (it-pages)/
│       └── support-center/                     # Main chat interface
│           ├── components/                     # Chat UI components
│           │   └── chat-message.tsx            # [TARGET] Message display component
│           └── page.tsx                        # Chat page wrapper
├── components/
│   └── ui/                                     # shadcn/ui base components
└── lib/
    └── types/                                  # TypeScript type definitions

backend/                                        # FastAPI backend
└── (NO CHANGES - UI-only fix)
```

**Structure Decision**: This is a web application frontend-only change. The chat message rendering components are located in `it-app/app/(it-pages)/support-center/components/`. No backend or database changes are required. The fix involves modifying the chat message component to apply `dir="auto"` to text containers.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations - this section intentionally left empty*

---

## Phase 0: Research & Unknowns Resolution

### Unknowns to Research

1. **Chat Component Location**: Identify the exact component(s) responsible for rendering message text content
2. **Current Direction Handling**: Determine if any existing `dir` attributes or CSS direction properties are applied
3. **Bubble Alignment Logic**: Understand how left/right positioning is implemented (ensure independence from text direction)
4. **Testing Approach**: Determine best practices for testing bidirectional text rendering (visual regression, manual screenshots)

### Research Tasks

| Task | Description | Owner | Status |
|------|-------------|-------|--------|
| R-1 | Locate chat message display component(s) in it-app | TBD | Pending |
| R-2 | Audit existing CSS for direction-related properties | TBD | Pending |
| R-3 | Identify chat bubble alignment mechanism | TBD | Pending |
| R-4 | Research browser BiDi support and edge cases | TBD | Pending |
| R-5 | Determine testing strategy for RTL/LTR rendering | TBD | Pending |

---

## Phase 1: Design & Contracts

### Data Model

**Status**: N/A - No data model changes required

This feature is a pure UI fix. The chat message entity structure remains unchanged in the backend and frontend types.

### API Contracts

**Status**: N/A - No API changes required

This feature does not involve any API endpoints, backend services, or data transformations.

### Quickstart Guide

**Status**: To be generated after Phase 0 research

Will include:
- Steps to locate the chat message component
- How to apply `dir="auto"` attribute
- CSS considerations for text alignment vs direction
- Testing checklist for mixed-language messages
