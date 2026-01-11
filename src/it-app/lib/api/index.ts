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

// Client-side utilities (fetch-based)
export {
  api,
  apiClient,
  default,
  getClientErrorMessage,
  ClientFetchError,
} from '../fetch/client';
export { getErrorMessage, isAPIError } from './client-fetch';

// Server-side utilities (fetch-based)
export {
  makeAuthenticatedRequest,
  makePublicRequest,
  getServerAccessToken,
  getServerSessionId,
  getServerUserInfo,
  getServerErrorMessage,
  isServerAPIError,
  ServerFetchError,
} from './server-fetch';

// Service Request API
export {
  createServiceRequest,
  getServiceRequest,
  getServiceRequests,
  type CreateServiceRequestData,
  type ServiceRequest,
} from './service-request';
