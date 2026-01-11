'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
import type {
  ServiceRequestDetail
} from '@/types/ticket-detail';
import type {
  CreateServiceRequestData,
  ListServiceRequestsParams,
  TechnicianViewsParams,
  TechnicianViewsResponse,
  ServiceRequestSummary,
} from '@/types/service-request';

/**
 * Create a new service request (Server Action)
 */
export async function createServiceRequest(
  data: CreateServiceRequestData,
  clientIp?: string
) {
  const headers: Record<string, string> = {};
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp;
    headers['X-Real-IP'] = clientIp;
  }

  const response = await serverFetch<ServiceRequestDetail>(
    '/requests',
    {
      method: 'POST',
      body: { title: data.title.trim() },
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    }
  );

  return response;
}

/**
 * Get service request by ID (Server Action)
 *
 * Cache: NO_CACHE (ticket may be actively edited)
 */
export async function getServiceRequestById(id: string) {
  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Request ID must be a valid UUID');
  }

  const response = await serverFetch<ServiceRequestDetail>(
    `/requests/${id}`,
    CACHE_PRESETS.NO_CACHE()
  );

  return response;
}

/**
 * List service requests (Server Action)
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
 */
export async function listServiceRequests(params?: ListServiceRequestsParams) {
  // Build query string
  const queryParams: Record<string, string> = {};

  if (params?.page) queryParams.page = params.page.toString();
  if (params?.perPage) queryParams.perPage = params.perPage.toString();
  if (params?.statusId) queryParams.statusId = params.statusId.toString();
  if (params?.categoryId) queryParams.categoryId = params.categoryId.toString();
  if (params?.assignedTechnicianId) queryParams.assignedTechnicianId = params.assignedTechnicianId.toString();

  const queryString = new URLSearchParams(queryParams).toString();
  const endpoint = queryString ? `/requests?${queryString}` : '/requests';

  const response = await serverFetch<{
    data: ServiceRequestSummary[];
    total: number;
    page: number;
    perPage: number;
  }>(endpoint, CACHE_PRESETS.NO_CACHE());

  return response;
}

/**
 * Get technician views (Server Action)
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
 */
export async function getTechnicianViews(params?: TechnicianViewsParams) {
  const view = params?.view || 'unassigned';
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  const queryParams = new URLSearchParams({
    view,
    page: page.toString(),
    per_page: perPage.toString(), // Backend uses snake_case
  });

  const endpoint = `/requests/technician-views?${queryParams.toString()}`;

  const response = await serverFetch<TechnicianViewsResponse>(
    endpoint,
    CACHE_PRESETS.NO_CACHE()
  );

  return response;
}
