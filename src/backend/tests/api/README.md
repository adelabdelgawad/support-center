# API Endpoint Tests

Comprehensive HTTP-level endpoint tests for the FastAPI backend.

## Summary

- **40 test files** created covering all 39 routers
- **~14,674 lines** of test code
- **300+ endpoints** tested across all domains
- **Full test infrastructure** with mocks for all external services

## Test Coverage by Domain

### Setting Routers (18 files)
- ✅ `test_users_endpoints.py` - User management (20+ endpoints)
- ✅ `test_roles_endpoints.py` - Role management
- ✅ `test_pages_endpoints.py` - Page configuration
- ✅ `test_business_units_endpoints.py` - Business unit management
- ✅ `test_categories_endpoints.py` - Category management
- ✅ `test_priorities_endpoints.py` - Priority levels
- ✅ `test_request_types_endpoints.py` - Request type configuration
- ✅ `test_request_statuses_endpoints.py` - Request status management
- ✅ `test_sections_endpoints.py` - Section management
- ✅ `test_sla_configs_endpoints.py` - SLA configurations
- ✅ `test_email_config_endpoints.py` - Email settings
- ✅ `test_ad_config_endpoints.py` - Active Directory config
- ✅ `test_domain_users_endpoints.py` - Domain user sync
- ✅ `test_org_units_endpoints.py` - Organizational units
- ✅ `test_bu_regions_endpoints.py` - Business unit regions
- ✅ `test_bu_user_assigns_endpoints.py` - BU user assignments
- ✅ `test_system_messages_endpoints.py` - System messages
- ✅ `test_custom_views_endpoints.py` - User custom views

### Support Routers (9 files)
- ✅ `test_requests_endpoints.py` - Service requests (20 endpoints)
- ✅ `test_chat_endpoints.py` - Chat messages (12 endpoints)
- ✅ `test_screenshots_endpoints.py` - Screenshot management (7 endpoints)
- ✅ `test_files_endpoints.py` - File attachments (10 endpoints)
- ✅ `test_chat_files_endpoints.py` - Chat file attachments (6 endpoints)
- ✅ `test_notifications_endpoints.py` - Notifications (11 endpoints)
- ✅ `test_request_notes_endpoints.py` - Internal notes (7 endpoints)
- ✅ `test_request_metadata_endpoints.py` - Request metadata (5 endpoints)
- ✅ `test_search_endpoints.py` - Search functionality (9 endpoints)

### Management Routers (6 files)
- ✅ `test_desktop_sessions_endpoints.py` - Desktop sessions (13 endpoints)
- ✅ `test_remote_access_endpoints.py` - Remote access (10 endpoints)
- ✅ `test_scheduler_endpoints.py` - Scheduled jobs (12 endpoints)
- ✅ `test_session_stats_endpoints.py` - Session statistics (10 endpoints)
- ✅ `test_system_events_endpoints.py` - System events (8 endpoints)
- ✅ `test_turn_endpoints.py` - TURN credentials (10 endpoints)

### Auth & Internal Routers (4 files)
- ✅ `test_auth_endpoints.py` - Authentication (24 tests, 11 endpoints)
- ✅ `test_audit_endpoints.py` - Audit logs (17 tests, 3 endpoints)
- ✅ `test_health_endpoints.py` - Health checks (15 tests, 4 endpoints)
- ✅ `test_events_endpoints.py` - Event streams (15 tests, 3 endpoints)

### Reporting Routers (2 files)
- ✅ `test_reports_endpoints.py` - Report generation (7 endpoints)
- ✅ `test_report_configs_endpoints.py` - Report configurations (5 endpoints)

### Regression Tests (1 file)
- ✅ `test_keyerror_regressions.py` - KeyError bug regressions (14 tests)

## Test Infrastructure

### Fixtures (`conftest.py`)
- `test_app` - FastAPI app with dependency overrides
- `client` - Authenticated HTTP client
- `unauth_client` - Unauthenticated HTTP client
- `seed_user` - Regular test user
- `seed_admin_user` - Admin test user
- `seed_role` - Test role
- `seed_priority` - Test priority
- `seed_request_status` - Test request status
- `seed_category` - Test category
- `seed_business_unit` - Test business unit
- `seed_region` - Test business unit region
- `seed_service_request` - Test service request
- `seed_page` - Test page

### External Service Mocks (Auto-applied)
- `mock_signalr_client` - SignalR notifications
- `mock_minio_service` - MinIO file storage
- `mock_ldap_service` - LDAP/Active Directory
- `mock_redis` - Redis presence/cache
- `mock_scheduler` - APScheduler

## Test Patterns

Each test file follows this pattern:

1. **Happy Path** - Valid requests → correct status codes and JSON structure
2. **Not Found** - Invalid IDs → 404 with proper error body
3. **Validation Errors** - Missing/invalid fields → 422 with validation detail
4. **Response Contract** - Verify camelCase fields (CamelModel), required vs optional
5. **Edge Cases** - Empty database, pagination boundaries, filter combinations
6. **Authentication** - 401 for unauthenticated requests where required
7. **Authorization** - 403 for insufficient permissions

## Running Tests

### Run All API Tests
```bash
cd src/backend
uv run pytest tests/api/ -v
```

### Run Specific Domain
```bash
# Setting routers only
uv run pytest tests/api/setting/ -v

# Support routers only
uv run pytest tests/api/support/ -v

# Management routers only
uv run pytest tests/api/management/ -v

# Regression tests only
uv run pytest tests/api/regression/ -v
```

### Run Specific Test File
```bash
uv run pytest tests/api/setting/test_users_endpoints.py -v
```

### Run Specific Test
```bash
uv run pytest tests/api/setting/test_users_endpoints.py::test_get_users_with_roles_empty_database -v
```

### Count Total Test Cases
```bash
uv run pytest tests/api/ --collect-only -q
```

## Critical Regression Tests

The following tests prevent previously identified bugs from returning:

### KeyError Bugs (Fixed)
- `test_get_users_with_roles_empty_database` - GET /backend/users/with-roles with no users
- `test_get_users_counts_empty_database` - GET /backend/users/counts with no users
- All count-based endpoints now return safe defaults (0) instead of raising KeyError

### Response Contract Tests
- All endpoints verify camelCase field names (CamelModel)
- All endpoints verify required keys are present
- All endpoints verify correct data types

## Test Database

Tests use a separate test database configured via:
```bash
TEST_DATABASE_URL=postgresql+asyncpg://servicecatalog:servicecatalog@localhost:5433/it_catalog_test
```

The test database is automatically created and cleaned between tests using transactional fixtures.

## Notes

- All tests use async/await patterns with `pytest.mark.asyncio`
- Database changes are rolled back after each test (transaction isolation)
- External services are mocked to avoid network dependencies
- Tests run independently and can be executed in any order
- Test data is created using factories from `tests/factories.py`
