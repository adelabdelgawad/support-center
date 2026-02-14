#!/bin/bash
# PostToolUse hook: Validates backend files follow Repository pattern architecture
# Fires after Edit/Write on src/backend/ files
# Exit 0 = pass, Exit 2 = violation (feedback to Claude)

set -euo pipefail

INPUT=$(cat)

# Extract file path from tool input (Edit uses file_path, Write uses file_path)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path or not a backend Python file
if [[ -z "$FILE_PATH" ]] || [[ "$FILE_PATH" != *"src/backend/"* ]] || [[ "$FILE_PATH" != *.py ]]; then
    exit 0
fi

# Helper: get just the filename
FILENAME=$(basename "$FILE_PATH")

VIOLATIONS=""

# --- Router validations (api/routers/) ---
if [[ "$FILE_PATH" == *"/api/routers/"* ]]; then

    # Check for direct database queries in routers (exclude comments)
    if grep -E '(select\(|session\.execute|session\.scalars|session\.scalar\b|\.query\()' "$FILE_PATH" 2>/dev/null | grep -qvE '^\s*#'; then
        VIOLATIONS="${VIOLATIONS}\n[ROUTER] Direct database query found in router. ALL routers must delegate to a Service class. Move query logic to a Service."
    fi

    # Check for direct repository imports in routers
    if grep -E 'from api\.repositories' "$FILE_PATH" 2>/dev/null | grep -qvE '^\s*#'; then
        VIOLATIONS="${VIOLATIONS}\n[ROUTER] Direct repository import in router. Routers should only import and delegate to Services, never repositories directly."
    fi

    # Check for session.commit() in routers (exclude comments)
    if grep -E '(session\.commit|await.*\.commit\(\))' "$FILE_PATH" 2>/dev/null | grep -qvE '^\s*#'; then
        VIOLATIONS="${VIOLATIONS}\n[ROUTER] session.commit() found in router. Transaction control belongs in the Service layer, not routers."
    fi

    # Check for old CRUD helper imports (exclude comments)
    if grep -E 'from api\.crud' "$FILE_PATH" 2>/dev/null | grep -qvE '^\s*#'; then
        VIOLATIONS="${VIOLATIONS}\n[ROUTER] Import from api.crud found. This project uses the Repository pattern (api/repositories/). CRUD helpers no longer exist."
    fi
fi

# --- Repository validations (api/repositories/) ---
# Skip validation for special query repositories that don't inherit from BaseRepository
if [[ "$FILENAME" == "reporting_query_repository.py" ]] || [[ "$FILENAME" == "outshift_query_repository.py" ]]; then
    exit 0
fi

if [[ "$FILE_PATH" == *"/api/repositories/"* ]] && [[ "$FILENAME" != "base.py" ]] && [[ "$FILENAME" != "__init__.py" ]]; then

    # Repos allowed to commit (compliance/security requirements)
    COMMIT_ALLOWED_REPOS="audit_repository.py|operational_log_repository.py|refresh_token_repository.py|token_repository.py|totp_repository.py|refresh_token_audit_repository.py"

    # Check for commit() in repository (should only flush) - skip allowed repos
    if [[ ! "$FILENAME" =~ ^($COMMIT_ALLOWED_REPOS)$ ]]; then
        if grep -E '\.commit\(\)' "$FILE_PATH" 2>/dev/null | grep -qvE '^\s*#'; then
            VIOLATIONS="${VIOLATIONS}\n[REPOSITORY] commit() found in repository. Repositories must only use flush(). The Service layer owns transaction control (commit/rollback). If this repo needs immediate commit for compliance/security, add it to the allowed list in the hook."
        fi
    fi

    # Check for BaseRepository inheritance
    if grep -qE '^class\s+\w+' "$FILE_PATH" 2>/dev/null; then
        if ! grep -qE 'BaseRepository\[' "$FILE_PATH" 2>/dev/null; then
            VIOLATIONS="${VIOLATIONS}\n[REPOSITORY] Repository class does not inherit from BaseRepository[T]. All repositories must extend BaseRepository[ModelClass]."
        fi
    fi
fi

# --- Service validations (api/services/) ---
if [[ "$FILE_PATH" == *"/api/services/"* ]]; then

    # Check for old CRUD helper imports (exclude comments)
    if grep -E 'from api\.crud' "$FILE_PATH" 2>/dev/null | grep -qvE '^\s*#'; then
        VIOLATIONS="${VIOLATIONS}\n[SERVICE] Import from api.crud found. This project uses the Repository pattern. Import from api.repositories instead."
    fi

    # Check that service uses repositories - ONLY for services that take a session parameter
    # External integration services (LDAP, Redis, email) don't need repositories
    if grep -qE '^class\s+\w+Service' "$FILE_PATH" 2>/dev/null; then
        # Only check if the service constructor takes a session parameter
        if grep -qE 'def __init__.*session' "$FILE_PATH" 2>/dev/null; then
            if ! grep -qE '(from api\.repositories|Repository\()' "$FILE_PATH" 2>/dev/null; then
                VIOLATIONS="${VIOLATIONS}\n[SERVICE] Service class takes session but does not use repositories. Services with DB access should instantiate repositories in __init__ (e.g., self.user_repo = UserRepository(session))."
            fi
        fi
    fi
fi

# --- Schema validations (api/schemas/) ---
if [[ "$FILE_PATH" == *"/api/schemas/"* ]] && [[ "$FILENAME" != "_base.py" ]] && [[ "$FILENAME" != "__init__.py" ]]; then

    # Check for CamelModel or HTTPSchemaModel inheritance (both provide camelCase conversion)
    if grep -qE '^class\s+\w+' "$FILE_PATH" 2>/dev/null; then
        if ! grep -qE '(CamelModel|HTTPSchemaModel)' "$FILE_PATH" 2>/dev/null; then
            VIOLATIONS="${VIOLATIONS}\n[SCHEMA] Schema classes should inherit from CamelModel (from api.schemas._base import CamelModel) or HTTPSchemaModel (from core.schema_base import HTTPSchemaModel) for automatic camelCase conversion."
        fi
    fi
fi

# --- General checks for any backend file ---
# Check for old api/crud imports (exclude comments and docstrings)
# Only flag actual import statements, not migration comments
if [[ "$FILE_PATH" != *"/api/routers/"* ]] && [[ "$FILE_PATH" != *"/api/services/"* ]]; then
    if grep -E '^from api\.crud|^import api\.crud' "$FILE_PATH" 2>/dev/null | grep -qvE '^\s*#'; then
        VIOLATIONS="${VIOLATIONS}\n[PATTERN] Active import from api.crud found. This project uses the Repository pattern (api/repositories/). CRUD helpers no longer exist."
    fi
fi

# Report violations
if [[ -n "$VIOLATIONS" ]]; then
    echo -e "ARCHITECTURE VIOLATION(S) detected in: $FILE_PATH\n$VIOLATIONS\n\nPlease fix the file to follow the Repository pattern: Router -> Service -> Repository -> Model.\nSee .claude/.claude-plugins/fullstack-agents/skills/fastapi/SKILL.md for the correct patterns." >&2
    exit 2
fi

exit 0
