# Simplify Backend Architecture — Flatten Simple Resources

**Status: IMPLEMENTED** (2026-01-31)

## Overview

The backend previously used a 3-layer call chain for all resources: **endpoint → service → CRUD → DB**. For many simple resources, the service and CRUD layers were pure passthrough with no business logic.

Following the [FastAPI official full-stack template](https://github.com/fastapi/full-stack-fastapi-template/tree/master/backend/app) pattern, simple resources now use a flat approach: endpoints query the DB directly (or call CRUD directly), with no service layer.

---

## Problem Analysis

### Current Issues

| Issue | Example |
|---|---|
| **Empty CRUD classes** | `BusinessUnitCRUD` is just `model = BusinessUnit` — zero custom methods |
| **Passthrough services** | `PageService.get_page()` only calls `PageCRUD.find_by_id_with_permissions()` and adds decorators |
| **Inconsistent patterns** | `SystemEventService` half-uses its CRUD, half does raw queries |
| **Endpoints bypassing services** | `organizational_units.py` imports `OrganizationalUnitCRUD` directly, breaking the architectural contract |
| **Decorator overhead on trivial ops** | 3 stacked decorators (`@safe_database_query`, `@transactional_database_operation`, `@log_database_operation`) on simple get-by-id calls |

### Call Chain Comparison

**Current (simple resource like pages):**
```
GET /api/v1/pages/{id}
  → PageService.get_page()              # adds @safe_database_query + @log_database_operation
    → PageCRUD.find_by_id_with_permissions()  # builds SELECT with selectinload
      → db.execute(stmt)                       # actual DB call
```
3 layers for a single SELECT query.

**Target (FastAPI template pattern):**
```
GET /api/v1/pages/{id}
  → PageCRUD.find_by_id_with_permissions(db, page_id)  # or inline query
    → db.execute(stmt)
```
1-2 layers. Service eliminated.

---

## Resource Classification

### SIMPLE — Flatten (eliminate service + thin CRUD)

These resources have **no business logic** beyond basic CRUD. The service layer is pure passthrough.

#### 1. `business_unit`

| Layer | File | Status |
|---|---|---|
| CRUD | `crud/business_unit_crud.py` | **DELETE** — empty class, unused by service |
| Service | `services/business_unit_service.py` | **DELETE** — all methods are direct DB ops with decorators |
| Endpoint | `api/v1/endpoints/business_units.py` | **MODIFY** — inline DB queries from service |

**Details:**
- The CRUD class has zero custom methods (just `model = BusinessUnit`)
- The service doesn't even use the CRUD — it does raw SQLAlchemy directly
- Every service method is a single DB operation wrapped in decorators
- `get_business_unit_by_ip` has IP-to-CIDR matching logic — move inline into endpoint
- No cross-service calls or complex validation

#### 2. `service_section`

| Layer | File | Status |
|---|---|---|
| CRUD | `crud/service_section_crud.py` | **KEEP** — has useful custom queries |
| Service | `services/service_section_service.py` | **DELETE** — pure 1:1 passthrough |
| Endpoint | `api/v1/endpoints/service_sections.py` | **MODIFY** — call CRUD directly |

**Details:**
- CRUD has meaningful methods: `find_all_active`, `toggle_active`, `find_section_technicians`
- Service is 100% passthrough — every method delegates to CRUD with zero added logic
- Endpoint is read-only (no create/update/delete exposed)
- Simply remove service layer and call CRUD from endpoint

#### 3. `tag`

| Layer | File | Status |
|---|---|---|
| CRUD | N/A | No CRUD file exists |
| Service | `services/tag_service.py` | **DELETE** — minor FK check can move to endpoint |
| Endpoint | `api/v1/endpoints/tags.py` | **MODIFY** — inline DB queries |

**Details:**
- No CRUD file — service already does raw SQLAlchemy
- Only "business logic" is checking that `category_id` exists before create/update (simple FK check)
- Move the category existence check into the endpoint

#### 4. `system_event`

| Layer | File | Status |
|---|---|---|
| CRUD | `crud/system_event_crud.py` | **DELETE** — only 1 custom method, barely used |
| Service | `services/system_event_service.py` | **DELETE** — already does raw SQL, minor FK validation |
| Endpoint | `api/v1/endpoints/system_events.py` | **MODIFY** — inline DB queries |

**Details:**
- CRUD has one custom method (`find_by_event_key`) — service barely uses it
- Service already does raw SQLAlchemy in most methods, defeating the purpose of CRUD
- Only validation: checks `system_message_id` exists before create/update
- Move FK check into endpoint

#### 5. `page`

| Layer | File | Status |
|---|---|---|
| CRUD | `crud/page_crud.py` | **KEEP** — has real complexity (role-based access) |
| CRUD | `crud/page_crud.py` (`PageRoleCRUD`) | **KEEP** |
| Service | `services/page_service.py` | **DELETE** — pure passthrough to CRUD |
| Endpoint | `api/v1/endpoints/pages.py` | **MODIFY** — call CRUD directly |

**Details:**
- CRUD has genuinely complex queries: `get_pages_for_user` with role-based access filtering, joins, conditional super-admin logic
- Service is 100% passthrough — every method calls CRUD and adds only decorators
- Endpoint has path-uniqueness validation (keep in endpoint)
- Remove service, call CRUD directly from endpoint

---

### COMPLEX — Keep As-Is

These resources have **real business logic**, multi-step orchestration, or external integrations.

| Resource | CRUD Size | Why Keep |
|---|---|---|
| `service_request` | ~1500 lines | Core domain entity. Region-based authorization, 11 view types, assignee management, status lifecycle |
| `chat` | ~660 lines | Cursor pagination, read/unread tracking, cross-table joins, requester app views |
| `remote_access` | Moderate | Session state machine with heartbeat, orphan detection, pair-based lookups |
| `user` | Complex | Paginated listing with role counts, multi-level count queries, online status, bulk ops |
| `domain_user` | Moderate | AD sync orchestration, Celery background tasks, bulk create, multi-step transactional workflow |
| `organizational_unit` | Moderate | AD discovery integration via `LdapService`, duplicate name checks, external service dependency |
| `user_role` | Moderate | Internal helper with replace logic (delete + create in transaction), used by user_service |
| `active_directory_config` | Small | Mutual exclusion business rule (only one active config) |

---

## Cross-Cutting: Error Handling After Service Removal

The service decorators (`@safe_database_query`, `@transactional_database_operation`, `@log_database_operation`) are the main reason services exist for simple resources. After removing services:

| Concern | Current (Service Decorators) | Target |
|---|---|---|
| **Error handling** | `@safe_database_query` catches DB errors | Try/except in endpoint or FastAPI exception handlers |
| **Transactions** | `@transactional_database_operation` auto-commits | Explicit `await db.commit()` in endpoint (session from `get_session` dependency) |
| **Logging** | `@log_database_operation` logs timing | `logger.info/error` in endpoint where needed (most simple ops don't need it) |

---

## Execution Plan

### Phase 1: `service_section` (simplest — remove passthrough service)

1. Modify `api/v1/endpoints/service_sections.py` to import and call `ServiceSectionCRUD` directly
2. Add try/except and `await db.commit()` where needed
3. Delete `services/service_section_service.py`
4. Run tests, verify no broken imports

### Phase 2: `tag` (no CRUD, inline raw SQL)

1. Copy DB query logic from `services/tag_service.py` into `api/v1/endpoints/tags.py`
2. Move category existence check into endpoint
3. Delete `services/tag_service.py`
4. Run tests

### Phase 3: `system_event` (remove both CRUD + service)

1. Copy DB query logic from service into `api/v1/endpoints/system_events.py`
2. Move message FK check into endpoint
3. Delete `services/system_event_service.py`
4. Delete `crud/system_event_crud.py`
5. Run tests

### Phase 4: `page` (remove service, keep CRUD)

1. Modify `api/v1/endpoints/pages.py` to import and call `PageCRUD`/`PageRoleCRUD` directly
2. Keep path-uniqueness validation in endpoint
3. Delete `services/page_service.py`
4. Run tests

### Phase 5: `business_unit` (remove both CRUD + service)

1. Copy DB query logic from service into `api/v1/endpoints/business_units.py`
2. Move IP-to-CIDR matching logic inline
3. Delete `services/business_unit_service.py`
4. Delete `crud/business_unit_crud.py`
5. Run tests

### Phase 6: Cleanup

1. Remove unused imports across all modified files
2. Update `crud/__init__.py` if it exports deleted classes
3. Run full test suite: `cd src/backend && pytest`
4. Grep for references to deleted files: `grep -r "from services.page_service" src/backend/` etc.

---

## Files Summary

### DELETE (7 files)

| File | Reason |
|---|---|
| `src/backend/crud/business_unit_crud.py` | Empty class, unused |
| `src/backend/crud/system_event_crud.py` | Barely used, service does raw SQL |
| `src/backend/services/business_unit_service.py` | Pure DB ops with decorators |
| `src/backend/services/service_section_service.py` | 1:1 passthrough to CRUD |
| `src/backend/services/tag_service.py` | Minor FK check, raw SQL |
| `src/backend/services/system_event_service.py` | Raw SQL, minor FK check |
| `src/backend/services/page_service.py` | Pure passthrough to CRUD |

### MODIFY (5 files)

| File | Change |
|---|---|
| `src/backend/api/v1/endpoints/business_units.py` | Inline DB queries from service |
| `src/backend/api/v1/endpoints/service_sections.py` | Call CRUD directly |
| `src/backend/api/v1/endpoints/tags.py` | Inline DB queries from service |
| `src/backend/api/v1/endpoints/system_events.py` | Inline DB queries from service |
| `src/backend/api/v1/endpoints/pages.py` | Call CRUD directly |

### KEEP UNCHANGED

All complex resource services and CRUDs (service_request, chat, remote_access, user, domain_user, organizational_unit, user_role, active_directory_config).

---

## Verification Checklist

- [x] `cd src/backend && pytest` — 40 passed, 144 errors (all errors are `ConnectionRefusedError` on port 5433 — PostgreSQL not running, **not related to flattening**)
- [x] No broken imports — verified, zero references to deleted service/CRUD files remain
- [x] All 7 files deleted (5 services, 2 CRUDs)
- [x] All 5 endpoints refactored to inline DB access
- [x] `crud/__init__.py` cleaned up — no exports of deleted classes
- [ ] Each modified endpoint responds correctly (manual curl test)
- [ ] Error handling works (test with invalid IDs, missing FKs)
- [ ] Transaction commits work (create/update/delete operations persist)
