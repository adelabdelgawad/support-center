# User-Section Relationship Feature Implementation Plan

## Overview
Implement a many-to-many relationship between Users and Sections, allowing users to be assigned to multiple sections.

## Status

### ✅ Completed

#### Backend Changes
- [x] **Models** (`src/backend/db/models.py`)
  - Added `UserSection` junction table (user_id, section_id, assigned_by, is_active, created_at, updated_at, is_deleted)
  - Updated `User` model with `users: List["UserSection"]` relationship (reverse of UserSection)
  - Updated `Section` model with `users: List["UserSection"]` relationship (reverse of UserSection)
  - Updated `TechnicianSection` model with `users: List["UserSection"]` relationship (reverse of UserSection)

- [x] **Repository** (`src/backend/api/repositories/setting/user_section_repository.py`)
  - Created `UserSectionRepository` with full CRUD operations
  - Methods: `get_by_id()`, `get_user_section()`, `get_all_for_user()`, `create()`, `update()`, `delete()`, `get_active_section_ids_for_user()`, `set_sections_for_user()`

- [x] **Service** (`src/backend/api/services/setting/user_service.py`)
  - Added section management methods
  - Methods: `add_user_section()`, `remove_user_section()`, `get_user_sections()`, `set_user_sections()`, `get_user_section()`, `set_user_sections()`

- [x] **Router** (`src/backend/api/routers/setting/user_sections_router.py`)
  - Created `UserSectionsRouter` with all CRUD endpoints
  - Endpoints: GET `/users/{user_id}/sections`, POST `/users/{user_id}/sections`, PUT `/users/{user_id}/sections/{section_id}`, DELETE `/users/{user_id}/sections/{section_id}`

- [x] **Schemas** (`src/backend/api/schemas/user.py`)
  - Updated `UserCreate` to include `section_ids: List[int] = Field(default_factory=list)` field
  - Updated `UserUpdate` to include `section_ids: List[int]` field

### Frontend Changes
- [x] **Types** (`src/it-app/types/users.d.ts`)
  - Added `Section` type to `lib/api/sections.ts`
  - Added `UserSectionInfo` interface (id, userId, sectionId, section, isActive, assignedAt)
  - Updated `UserWithRolesResponse` to include `sections: UserSectionInfo[]` field

- [x] **Components** (`src/it-app/components/ui/`)
  - Created `sections-select.tsx` (similar to `roles-select.tsx` and `domain-users-select.tsx`)

### 🔄 In Progress

#### Backend Tasks
- [ ] Run Alembic migration: `alembic revision --autogenerate -m "Add user-section relationship"`
- [ ] Update database seed function in `setup_database.py` to pre-populate sections
- [ ] Test all new endpoints

#### Frontend Tasks
- [ ] Add Section column to `users-table-columns.tsx` display
- [ ] Update `users-table-body.tsx` to include Section cell
- [ ] Create `SectionsSelect` component (similar to `RolesSelect`)
- [ ] Update `users-actions-context.tsx` to include sections
- [ ] Update `add-user-sheet.tsx` to include section selection
- [ ] Update `edit-user-sheet.tsx` to include section selection
- [ ] Update `actions-menu.tsx` to include "Assign Section" action
- [ ] Update `users-table.tsx` to pass sections to context

### ⏳ Pending

#### Database Migration
- [ ] Create Alembic migration after confirming backend models are correct
- [ ] Test migration in development environment
- [ ] Run migration in production

#### Documentation
- [ ] Update `/docs/backend-api-reference.md` with new section endpoints

#### Testing Checklist
- [ ] Test section CRUD operations via API
- [ ] Test frontend section selection display
- [ ] Verify user can be assigned to multiple sections
- [ ] Verify data integrity after changes
- [ ] Test with real data volume

#### Known Issues/Risks
- [ ] **Relationship name conflict**: The `UserSection` model and `Section` model both have `users` relationships defined. Need to ensure one uses `back_populates="users"` and other uses `back_populates="section"` to avoid SQLAlchemy confusion.
- [ ] **Migration timing**: Need to run migration before updating frontend to avoid errors.
- [ ] **Data consistency**: Existing users won't have sections until migration is run and seeded.
