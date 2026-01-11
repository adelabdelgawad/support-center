/**
 * Service Requests (Tickets) API
 *
 * This module handles all ticket/service request operations.
 *
 * Endpoints used:
 * - GET /requests - List all requests (with pagination and filters)
 * - GET /requests/:id - Get single request details
 * - POST /requests - Create new request (as requester)
 * - PUT /requests/:id - Update request
 */

import apiClient, { getErrorMessage } from "./client";
import type {
  ServiceRequest,
  CreateServiceRequest,
  PaginatedResponse,
  ChatPageResponse,
  TicketFilterParams,
} from "@/types";

/**
 * Check if error is an AbortError (request was cancelled)
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export interface GetRequestsParams {
  page?: number;
  pageSize?: number;
  statusId?: number;
  priorityId?: number;
  search?: string;
}

/**
 * Get list of service requests (tickets)
 * @param params - Pagination and filter parameters
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Paginated list of service requests
 */
export async function getRequests(
  params: GetRequestsParams = {},
  signal?: AbortSignal
): Promise<PaginatedResponse<ServiceRequest>> {
  try {
    const response = await apiClient.get<PaginatedResponse<ServiceRequest>>(
      "/requests",
      {
        params: {
          page: params.page || 1,
          page_size: params.pageSize || 20,
          status_id: params.statusId,
          priority_id: params.priorityId,
          search: params.search,
        },
        signal, // Add signal support for request cancellation
      }
    );
    return response.data;
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get a single service request by ID
 * @param id - Request UUID
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Service request details
 */
export async function getRequestById(
  id: string,
  signal?: AbortSignal
): Promise<ServiceRequest> {
  try {
    const response = await apiClient.get<ServiceRequest>(`/requests/${id}`, {
      signal, // Add signal support for request cancellation
    });
    return response.data;
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Create a new service request
 * The backend automatically assigns:
 * - requesterId (from JWT)
 * - ipAddress (from request)
 * - businessUnitId (derived from IP)
 * - priorityId (default: Medium)
 * - statusId (default: Pending)
 *
 * @param data - Request data (only title is required)
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Created service request
 */
export async function createRequest(
  data: CreateServiceRequest,
  signal?: AbortSignal
): Promise<ServiceRequest> {
  try {
    // Use trailing slash to avoid 307 redirect which can lose POST body
    const response = await apiClient.post<ServiceRequest>("/requests/", data, {
      signal, // Add signal support for request cancellation
    });
    return response.data;
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Update an existing service request
 * @param id - Request UUID
 * @param data - Fields to update
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Updated service request
 */
export async function updateRequest(
  id: string,
  data: Partial<ServiceRequest>,
  signal?: AbortSignal
): Promise<ServiceRequest> {
  try {
    const response = await apiClient.put<ServiceRequest>(
      `/requests/${id}`,
      data,
      {
        signal, // Add signal support for request cancellation
      }
    );
    return response.data;
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

// ============================================================================
// All User Tickets (for client-side filtering)
// ============================================================================

/**
 * Get all tickets for the current user without any filters
 * This is optimized for client-side filtering
 *
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns All tickets for the current user
 */
export async function getAllUserTickets(
  signal?: AbortSignal
): Promise<ChatPageResponse> {
  try {
    const response = await apiClient.get<ChatPageResponse>("/chat/all-tickets", {
      signal, // Add signal support for request cancellation
    });
    return response.data;
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

// ============================================================================
// Ticket Page Data
// ============================================================================

/**
 * Get ticket page data including tickets, status counts, and filters
 * This endpoint provides all data needed for the ticket list view
 *
 * @param filters - Optional filter parameters (statusFilter, readFilter)
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Chat page response with tickets and status counts
 */
export async function getTicketPageData(
  filters?: TicketFilterParams,
  signal?: AbortSignal
): Promise<ChatPageResponse> {
  try {
    const params: Record<string, string | number> = {};

    if (filters?.statusFilter !== undefined) {
      params.status_filter = filters.statusFilter;
    }
    if (filters?.readFilter) {
      params.read_filter = filters.readFilter;
    }

    const response = await apiClient.get<ChatPageResponse>("/chat/page-data", {
      params,
      signal, // Add signal support for request cancellation
    });
    return response.data;
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Refresh ticket list with optional filters
 * Convenience wrapper for getTicketPageData
 *
 * @param filters - Optional filter parameters
 * @returns Chat page response
 */
export async function refreshTicketList(
  filters?: TicketFilterParams
): Promise<ChatPageResponse> {
  return getTicketPageData(filters);
}

// ============================================================================
// Paginated Requests (for infinite scroll)
// ============================================================================

/**
 * Get paginated service requests with cursor-based pagination
 * Used for infinite scroll implementation
 *
 * @param params - Pagination parameters (page, limit)
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Paginated response with tickets
 */
export async function getPaginatedRequests(
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal
): Promise<PaginatedResponse<ServiceRequest>> {
  try {
    const { page = 1, limit = 100 } = params;

    const response = await apiClient.get<PaginatedResponse<ServiceRequest>>(
      "/requests",
      {
        params: {
          page,
          per_page: limit,
          requester_view: true, // Only show statuses visible to requesters
        },
        signal,
      }
    );
    return response.data;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new Error(getErrorMessage(error));
  }
}
