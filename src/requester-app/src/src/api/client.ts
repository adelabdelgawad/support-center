/**
 * ============================================================================
 * PHASE 3 OPTIMIZATION: Switched to Native Fetch API
 * ============================================================================
 * API Client - Now using lightweight fetch-based client instead of axios
 *
 * This client automatically:
 * - Adds Bearer token to all requests
 * - Handles 401 unauthorized responses by redirecting to login
 * - Provides error handling utilities
 *
 * Benefits:
 * - 40-50 KB smaller bundle (no axios dependency)
 * - Native browser API (faster, no external dependencies)
 * - Same interface for easy migration
 *
 * Usage:
 * ```ts
 * import { apiClient } from '@/api/client';
 * const response = await apiClient.get('/endpoint');
 * ```
 */

// PHASE 3: Import fetch-based client instead of axios
import { fetchClient } from './fetch-client';

// ============================================================================
// PHASE 3: Export fetch-based client (replacing axios)
// ============================================================================

// Export fetch client as apiClient (drop-in replacement for axios)
export const apiClient = fetchClient;

// Export error handling utilities
export { getErrorMessage, isAPIError } from './fetch-client';

export default fetchClient;
