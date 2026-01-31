/**
 * Unified Fetch Architecture
 * Single entry point for all fetch utilities
 *
 * Usage:
 * - Client-side: import { api, apiClient, ApiError } from '@/lib/fetch'
 * - Server-side: import { serverGet, serverPost, ApiError } from '@/lib/fetch'
 * - API routes: import { withAuth } from '@/lib/fetch'
 */

// Error class (isomorphic)
export { ApiError, extractErrorMessage } from './errors';

// Client-side utilities
export {
  api,
  apiClient,
  getApiClient,
  getClientErrorMessage,
  getErrorMessage,
  isAPIError,
  ClientFetchError, // Legacy alias
} from './client';

// Server-side utilities
export {
  serverFetch,
  serverGet,
  serverPost,
  serverPut,
  serverPatch,
  serverDelete,
} from './server';

// API route helpers
export { withAuth } from './api-route-helper';
