# Testing Guide for IT Service Catalog Backend

Comprehensive test suite for the IT Support Center backend API.

## Test Structure

```
tests/
├── conftest.py                    # Shared fixtures (DB, mocks, test data)
├── factories.py                   # Test data factories
├── ENDPOINT_INVENTORY.md          # API endpoint documentation
├── README.md                      # This file
│
├── unit/                          # Fast, isolated unit tests
│   ├── test_auth_service.py       # Authentication service tests (14 tests)
│   ├── test_permission_cache_service.py  # Permission caching tests (21 tests)
│   └── test_assignee_permissions.py      # Assignee permission tests
│
├── integration/                   # Full integration tests
│   ├── test_ad_login_integration.py      # Active Directory login (8 tests)
│   ├── test_requests_api.py              # Service requests API
│   ├── test_chat_api.py                  # Chat/messaging API
│   └── test_users_api.py                 # User management API
│
└── manual_test_ad_auth.py         # Manual testing script
```

## Running Tests

### All Tests
```bash
uv run pytest
```

### Specific Test File
```bash
uv run pytest tests/unit/test_auth_service.py
```

### Specific Test Class
```bash
uv run pytest tests/unit/test_auth_service.py::TestUserCreationFromAD
```

### Specific Test
```bash
uv run pytest tests/unit/test_auth_service.py::TestUserCreationFromAD::test_create_user_from_ad_success -v
```

### With Coverage
```bash
uv run pytest --cov=services --cov=models --cov-report=html
```

## Test Database

Tests use an **in-memory SQLite database** for fast, isolated testing. However, due to PostgreSQL-specific types (JSONB, UUID), you should run integration tests against a real PostgreSQL test database.

### Using PostgreSQL for Integration Tests

1. Create a test database:
```sql
CREATE DATABASE it_service_catalog_test;
```

2. Set environment variable:
```bash
export TEST_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5433/it_service_catalog_test"
```

3. Run tests:
```bash
uv run pytest tests/integration/
```

## Current Test Status

### ✅ Fixed Issues
1. **Import Error**: Fixed `RolePage` → `PageRole` in `permission_cache_service.py`
2. **Cache Service**: Fixed `cache_service` → `cache` import
3. **Duplicate User Handling**: Added race condition handling with case-insensitive username matching

### Test Coverage

#### Unit Tests - Authentication Service (14 tests)
- ✅ User creation from AD data
- ✅ User update from AD data
- ✅ AD login flow (new users)
- ✅ AD login flow (existing users)
- ✅ Case-insensitive username matching
- ✅ Duplicate key error handling
- ✅ Invalid credentials handling
- ✅ Inactive/blocked user handling
- ✅ SSO login flow

#### Unit Tests - Permission Cache Service (21 tests)
- ✅ Loading permissions from database
- ✅ Caching permissions in Redis
- ✅ Cache hit/miss scenarios
- ✅ Cache invalidation
- ✅ Role-based permission checks
- ✅ Page access checks
- ✅ Super admin permissions

#### Integration Tests - AD Login (8 tests)
- ✅ Complete AD login flow
- ✅ User data updates on login
- ✅ Concurrent login handling
- ✅ Technician redirect paths
- ✅ Manager relationships
- ✅ Multiple sessions per user

## Running Tests Without SQLite Compatibility Issues

Due to PostgreSQL-specific features (JSONB, UUID with PostgreSQL_UUID), the recommended approach is:

### Option 1: Use Docker for Test Database
```bash
# Start test database
docker run --name test-postgres -e POSTGRES_PASSWORD=testpass -e POSTGRES_DB=test_db -p 5434:5432 -d postgres:15

# Run tests
export TEST_DATABASE_URL="postgresql+asyncpg://postgres:testpass@localhost:5434/test_db"
uv run pytest
```

### Option 2: Manual Testing
Run the application and test endpoints manually:

```bash
# Start services
docker-compose up -d postgres redis

# Run migrations
uv run alembic upgrade head

# Start server
uvicorn main:app --reload

# Test AD login endpoint
curl -X POST http://localhost:8000/api/v1/auth/ad-login \
  -H "Content-Type: application/json" \
  -d '{"username": "test.user", "password": "password", "device_info": {}}'
```

## Test Scenarios Covered

### 1. User Creation from AD
- New user is created with AD data
- Manager relationships are established
- Domain flag is set correctly

### 2. User Updates from AD
- Existing user data is updated on login
- Missing AD data doesn't overwrite existing data
- Case-insensitive username matching works

### 3. Race Condition Handling
- Concurrent logins don't cause duplicate key errors
- Failed creation attempts trigger retry with fetch
- Existing users are found and updated

### 4. Permission Caching
- Permissions are loaded from database
- Permissions are cached in Redis with TTL
- Cache invalidation works for users and roles
- Super admin has all permissions

### 5. Complete Login Flow
- Authentication creates user, session, and token
- Permissions are cached on login
- Correct redirect paths based on user type
- Multiple sessions can exist per user

## Next Steps

To fully test the AD authentication logic in your environment:

1. **Test with Real AD Server** (if available):
   - Configure `.env` with AD settings
   - Test with actual AD credentials
   - Verify user data sync from AD

2. **Load Testing**:
   - Test concurrent logins for same user
   - Verify no race conditions occur
   - Check Redis cache performance

3. **Error Scenarios**:
   - AD server unavailable
   - Invalid LDAP configuration
   - Network timeouts

## Notes

- All tests use mocked LDAP service for AD authentication
- Cache operations are mocked to avoid Redis dependency
- Tests are designed to be fast and independent
- Each test gets a fresh database session
