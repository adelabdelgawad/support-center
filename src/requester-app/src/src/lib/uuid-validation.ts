/**
 * UUID Validation Utilities
 *
 * Enforces strict UUID format for session IDs to prevent
 * legacy numeric values from causing 422 errors.
 */

// UUID v4 regex pattern (case-insensitive)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return UUID_REGEX.test(value);
}

/**
 * Validate and return UUID, or null if invalid
 * Use this for all sessionId access to enforce UUID-only contract
 */
export function validateUUID(value: unknown): string | null {
  if (isValidUUID(value)) {
    return value;
  }

  if (value !== null && value !== undefined) {
    console.warn(`[UUID] Invalid UUID rejected: "${value}" (type: ${typeof value})`);
  }

  return null;
}

/**
 * Assert that a value is a valid UUID, throwing if not
 * Use for strict validation at API boundaries
 */
export function assertUUID(value: unknown, context: string): string {
  const validated = validateUUID(value);
  if (validated === null) {
    throw new Error(`[UUID] Invalid UUID in ${context}: "${value}"`);
  }
  return validated;
}
