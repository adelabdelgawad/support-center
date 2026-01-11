```markdown
Generate comprehensive integration tests for this project by scanning all frontend API calls.

This command works for any project - it discovers your API patterns dynamically.

---

PHASE 1: ANALYZE PROJECT STRUCTURE (think hard)

1. **Detect project type**:
   - Backend: FastAPI? Django? Express? Flask? Spring Boot?
   - Frontend: Next.js? React? Vue? Angular?
   - Language: Python? TypeScript? JavaScript? Java?
   - Test framework: pytest? Jest? JUnit? Vitest?

2. **Find API client patterns**:
   - Search for: axios, fetch, httpx, requests, API service files
   - Detect: Base URL configuration, API client setup
   - Identify: Authentication pattern (Bearer token? Cookies? Session?)
   - Locate: Type definitions or schemas

3. **Discover project conventions**:
   - Where are API calls made? (services/, api/, lib/, hooks/)
   - How are types defined? (TypeScript interfaces? OpenAPI? Zod?)
   - Test location convention? (tests/, __tests__, spec/)
   - Database/ORM used? (SQLAlchemy? Prisma? TypeORM?)

---

PHASE 2: SCAN AND DOCUMENT ALL ENDPOINTS

1. **Extract all API calls from frontend**:
   - Find every HTTP request (GET, POST, PUT, DELETE, PATCH)
   - Document: method, path, body schema, query params, headers
   - Note: Authentication requirements per endpoint
   - Identify: Request/response types

2. **Group endpoints logically**:
   - Analyze URL patterns to identify domains
   - Group related endpoints together
   - Create logical test module structure

3. **Create endpoint inventory**: `ENDPOINT_INVENTORY.md`
   - List all discovered endpoints
   - Show request/response schemas
   - Note authentication requirements
   - Present for review before generating tests

---

PHASE 3: GENERATE TEST SUITE

Based on detected stack, generate appropriate tests:

**If Python/FastAPI:**
- Use pytest + FastAPI TestClient
- AsyncIO test patterns
- SQLAlchemy fixtures with rollback

**If Node/Express:**
- Use Jest + supertest
- async/await patterns
- Database seeding/cleanup

**If Java/Spring:**
- Use JUnit + MockMvc
- Spring test annotations
- Transaction rollback

**Generate files:**
```
tests/
├── conftest.py (or equivalent setup file)
├── factories (test data generators)
├── test_{domain1}.{ext}
├── test_{domain2}.{ext}
└── README.md (how to run tests)
```

**For each endpoint, create tests:**
1. Happy path (success scenario)
2. Unauthenticated access (401)
3. Unauthorized access (403)
4. Validation errors (400)
5. Not found (404)
6. Business logic errors

**Use project's existing patterns:**
- Match naming conventions from existing tests (if any)
- Follow project's code style
- Use project's test utilities/helpers
- Respect project's directory structure

---

PHASE 4: GENERATE REALISTIC TEST DATA

1. **Read frontend types/schemas**:
   - Extract field definitions
   - Note required vs optional fields
   - Identify data types and constraints

2. **Create data factories**:
   - Generate realistic values (not "test", "foo", "string")
   - Use appropriate data for each field type:
     - Names: "John Doe", "Sarah Smith"
     - Emails: "user@company.com"
     - Dates: ISO format, realistic dates
     - IDs: Valid references (1, 2, 3)
     - Enums: Actual enum values from code

3. **Handle relationships**:
   - Create factories for related entities
   - Set up proper foreign key references
   - Ensure referential integrity

---

PHASE 5: CREATE FIXTURES AND UTILITIES

Generate reusable test infrastructure:

1. **Authentication fixtures**:
   - Login/token generation
   - Headers with auth
   - Different user roles

2. **Database fixtures**:
   - Session management
   - Transaction rollback
   - Seed data

3. **Client fixtures**:
   - Test client setup
   - Base URL configuration
   - Common headers

---

PHASE 6: ADD DOCUMENTATION

Create `tests/README.md` with:
- How to run all tests
- How to run specific test files
- How to add new tests
- Coverage reporting
- CI/CD integration example

---

EXECUTION COMMANDS:

After generation, provide commands for this project:
- Run all tests
- Run with coverage
- Run specific module
- Parallel execution (if supported)

---

SUCCESS CRITERIA:

- [ ] All frontend API calls discovered
- [ ] Tests match project's stack and conventions
- [ ] Realistic test data generated
- [ ] Authentication/authorization tested
- [ ] Validation and error cases covered
- [ ] Tests are isolated and repeatable
- [ ] Documentation clear and complete
- [ ] All tests pass on first run

---

ADAPTIVE BEHAVIOR:

This command automatically adapts to:
- Any backend framework
- Any frontend framework
- Any programming language
- Any test framework
- Any project structure

It discovers your patterns and generates tests that fit YOUR project.

---

START:

1. Analyze project structure and detect stack
2. Scan frontend for all API calls
3. Generate endpoint inventory for review
4. Generate test suite matching your conventions
5. Run tests and verify they work
```