<!--
================================================================================
SYNC IMPACT REPORT
================================================================================
Version Change: 0.0.0 → 1.0.0 (MAJOR - Initial constitution adoption)

Modified Principles: N/A (initial version)

Added Sections:
- Core Principles (5 principles)
- Development Standards
- Quality Gates
- Governance

Removed Sections: N/A (initial version)

Templates Requiring Updates:
- .specify/templates/plan-template.md: ✅ Compatible (Constitution Check section exists)
- .specify/templates/spec-template.md: ✅ Compatible (requirements align with principles)
- .specify/templates/tasks-template.md: ✅ Compatible (phase structure supports principles)

Follow-up TODOs: None
================================================================================
-->

# IT Support Center Constitution

## Core Principles

### I. HTTPSchemaModel Inheritance (NON-NEGOTIABLE)

All backend Pydantic schemas MUST inherit from `HTTPSchemaModel` (located in `core/schema_base.py`), never from plain `BaseModel`.

**Rationale**: This base class provides automatic snake_case to camelCase conversion for JSON responses, ensuring seamless compatibility between the Python backend (snake_case) and Next.js frontend (camelCase). It also pre-configures `from_attributes`, `alias_generator`, and `populate_by_name` settings, eliminating redundant configuration.

**Enforcement**:
- Code reviews MUST reject any schema inheriting directly from `BaseModel`
- Linting rules SHOULD flag `from pydantic import BaseModel` usage in schema files

### II. API Proxy Pattern (NON-NEGOTIABLE)

Client-side components MUST NEVER call the FastAPI backend directly. All API communication MUST flow through Next.js API routes as a proxy layer.

**Required Flow**:
```
Client Component → Next.js API Route (/api/*) → FastAPI Backend
```

**Rationale**: This pattern ensures httpOnly cookies containing authentication tokens are never exposed to client-side JavaScript, maintains a single source of truth for API communication, and enables proper server-side token management.

**Enforcement**:
- Direct imports of backend axios clients in client components MUST be rejected
- All client API calls MUST use `fetch('/api/...')` with `credentials: 'include'`
- Server-side routes MUST use `makeAuthenticatedRequest()` or `axiosServerPublic`

### III. Bun Package Manager (NON-NEGOTIABLE)

The `it-app/` directory MUST exclusively use `bun` for all package management and script execution. Usage of `npm`, `yarn`, or `node` commands is prohibited in this directory.

**Required Commands**:
- `bun install` (not npm install)
- `bun run dev` (not npm run dev)
- `bun run build` (not npm run build)
- `bun add <package>` (not npm install <package>)

**Rationale**: The project uses `bun.lock` for dependency resolution. Mixed package managers cause lockfile conflicts, inconsistent dependency versions, and build failures.

**Enforcement**:
- CI/CD pipelines MUST use bun commands for the it-app
- Pull requests modifying `package-lock.json` in it-app MUST be rejected

### IV. Service Layer Architecture

Business logic MUST be organized into service classes located in `services/`. API endpoints MUST be thin wrappers that validate input and delegate to services.

**Structure**:
- `services/<resource>_service.py`: Contains all business logic and database operations
- `api/v1/endpoints/<resource>.py`: Handles HTTP concerns, validation, and calls services
- Services MUST use decorators from `core/decorators.py` for error handling and transactions

**Rationale**: This separation ensures testable business logic, consistent error handling, and maintainable code. Services can be unit tested without HTTP concerns.

**Enforcement**:
- Endpoints with more than 10 lines of business logic SHOULD be refactored
- Database queries in endpoint files MUST be moved to services

### V. Clean Code Removal

When removing or replacing features, all related code MUST be deleted completely. No commented-out code, legacy wrappers, backwards compatibility shims, or deprecation comments are permitted.

**Prohibited Patterns**:
- `# Legacy: kept for backwards compatibility`
- `# DEPRECATED: Use new_function instead`
- `def old_function(): return new_function()`
- `# // removed` or `# TODO: remove later`

**Rationale**: Git history preserves removed code. Dead code creates confusion, increases maintenance burden, and inflates bundle sizes. Clean deletion ensures a maintainable codebase.

**Enforcement**:
- Code reviews MUST reject commented-out code blocks
- Unused imports and functions MUST be removed

## Development Standards

### Model Selection for Tasks

Different task types MUST use specific AI models for optimal results:

| Task Type | Model | Use Case |
|-----------|-------|----------|
| Planning | opus | Architecture design, complex analysis, feature planning |
| Investigation | opus | Debugging, root cause analysis, codebase exploration |
| Testing | haiku | Running tests, quick validations, status monitoring |
| Implementation | sonnet | Writing code, making edits, executing commands |

### Database Conventions

- Index definitions MUST use `__table_args__` only, never `index=True` in `Field()`
- Migrations MUST be reviewed before applying
- Async operations MUST use `asyncpg` and `AsyncSession`

### Frontend Conventions

- State management MUST use SWR hooks with optimistic updates
- UI components MUST prefer shadcn/ui from `/components/ui/`
- Server actions MUST use `Promise.all` for parallel fetching

## Quality Gates

### Pre-Commit Requirements

1. All new backend schemas inherit from `HTTPSchemaModel`
2. No direct backend calls from client components
3. No `npm` or `node` commands in it-app directory
4. Business logic resides in service layer
5. No commented-out or deprecated code

### Pull Request Checklist

- [ ] Schema inheritance verified (HTTPSchemaModel)
- [ ] API proxy pattern followed
- [ ] Correct package manager used (bun for it-app)
- [ ] Service layer pattern maintained
- [ ] No legacy/dead code introduced

## Governance

This constitution supersedes all other development practices for the IT Support Center project. Amendments require:

1. Documented justification for the change
2. Impact analysis on existing code
3. Migration plan for affected components
4. Team review and approval

**Versioning Policy**:
- MAJOR: Principle removals or backward-incompatible governance changes
- MINOR: New principles added or material expansions
- PATCH: Clarifications, wording improvements, typo fixes

**Compliance Review**: All pull requests and code reviews MUST verify compliance with these principles. Complexity beyond these standards MUST be explicitly justified in the PR description.

**Runtime Guidance**: For detailed implementation patterns and examples, refer to `CLAUDE.md` at the repository root.

**Version**: 1.0.0 | **Ratified**: 2026-01-08 | **Last Amended**: 2026-01-08
