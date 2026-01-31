/**
 * API Client Exports
 *
 * Usage Examples:
 *
 * Client-side (use in client components):
 * ```tsx
 * import { apiClient } from '@/lib/api';
 *
 * // GET request
 * const users = await apiClient.get<User[]>('/api/users');
 *
 * // POST request
 * const newUser = await apiClient.post<User>('/api/users', { name: 'John' });
 * ```
 *
 * Server-side (use in server actions/components):
 * ```tsx
 * import { makeAuthenticatedRequest } from '@/lib/api';
 *
 * const user = await makeAuthenticatedRequest<UserInfo>('GET', '/users/me');
 * ```
 */

// New canonical imports (from lib/fetch)
export {
  ApiError,
  api,
  apiClient,
  getErrorMessage,
  isAPIError,
  getClientErrorMessage,
} from '@/lib/fetch';

export {
  serverFetch,
  serverGet,
  serverPost,
  serverPut,
  serverPatch,
  serverDelete,
  withAuth,
} from '@/lib/fetch';

// Server-side utilities (from lib/api/server-fetch)
export {
  makeAuthenticatedRequest,
  makePublicRequest,
  publicFetch,
  getServerAccessToken,
  getServerSessionId,
  getServerUserInfo,
  getServerErrorMessage,
  isServerAPIError,
  CACHE_PRESETS,
} from './server-fetch';

// Legacy re-exports for backward compatibility
export { ApiError as ClientFetchError } from '@/lib/fetch';
export { ApiError as ServerFetchError } from '@/lib/fetch';
export { ApiError as ServerApiError } from '@/lib/fetch';

// Service Request API
export {
  createServiceRequest,
  getServiceRequest,
  getServiceRequests,
  type CreateServiceRequestData,
  type ServiceRequest,
} from './service-request';

// Default export
export { default } from '@/lib/fetch/client';
