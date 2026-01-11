'use client';

/**
 * Service Request API client
 * Handles all service request-related API calls
 *
 * IMPORTANT: This calls Next.js API routes (/api/requests), NOT the backend directly.
 * The API routes handle authentication and proxy requests to the backend.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';

/**
 * Service Request creation request (requester provides title and optional service section)
 */
export interface CreateServiceRequestData {
  title: string;
  serviceSectionId?: number;
}

/**
 * Service Request response from API
 */
export interface ServiceRequest {
  id: string;
  title: string;
  description: string | null;
  requesterId: number;
  assignedTechnicianId: number | null;
  businessUnitId: number | null;
  serviceSectionId: number | null;
  statusId: number;
  priorityId: number;
  subcategoryId: number | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}

/**
 * Create a new service request (requester workflow)
 *
 * Only requires title. System auto-captures:
 * - IP address from request
 * - Business unit (matched from IP network)
 * - Requester ID (from authenticated user)
 * - Priority (defaults to Medium/3)
 * - Status (defaults to Pending/1)
 *
 * @param data - Service request creation data (title only)
 * @returns Created service request
 */
export async function createServiceRequest(
  data: CreateServiceRequestData
): Promise<ServiceRequest> {
  try {
    return await apiClient.post<ServiceRequest>('/api/requests', data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get service request by ID
 *
 * @param requestId - ID of the service request
 * @returns Service request details
 */
export async function getServiceRequest(requestId: string): Promise<ServiceRequest> {
  try {
    return await apiClient.get<ServiceRequest>(`/api/requests/${requestId}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get list of service requests
 *
 * @param params - Optional query parameters for filtering
 * @returns List of service requests with pagination
 */
export async function getServiceRequests(params?: {
  page?: number;
  perPage?: number;
  statusId?: number;
  categoryId?: number;
  assignedTechnicianId?: number;
}): Promise<{
  items: ServiceRequest[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.perPage) queryParams.set('perPage', params.perPage.toString());
    if (params?.statusId) queryParams.set('statusId', params.statusId.toString());
    if (params?.categoryId) queryParams.set('categoryId', params.categoryId.toString());
    if (params?.assignedTechnicianId) {
      queryParams.set('assignedTechnicianId', params.assignedTechnicianId.toString());
    }

    const queryString = queryParams.toString();
    const url = queryString ? `/api/requests?${queryString}` : '/api/requests';

    return await apiClient.get(url);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
