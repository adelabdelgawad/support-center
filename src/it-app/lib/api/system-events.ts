'use client';

/**
 * Client-side API for system events
 * All calls go through Next.js API routes (/api/setting/system-events/*)
 * which then proxy to the backend. This ensures the backend is only
 * accessible from the server.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  SystemEventResponse,
  SystemEventListResponse,
  SystemEventCreate,
  SystemEventUpdate,
  SystemEventCountsResponse,
} from '@/types/system-events';

const API_BASE = '/api/setting/system-events';

/**
 * Fetches system events with pagination and filtering capabilities
 */
export async function getSystemEvents(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    event_name?: string;
    [key: string]: string | undefined;
  };
}): Promise<SystemEventListResponse> {
  try {
    const queryParams = new URLSearchParams();

    // Add skip and limit directly
    queryParams.append('skip', params?.skip.toString() ?? '0');
    queryParams.append('limit', params?.limit.toString() ?? '20');

    // Add filter criteria
    if (params?.filterCriteria) {
      Object.entries(params.filterCriteria).forEach(([key, value]) => {
        if (value?.trim()) {
          queryParams.append(key, value);
        }
      });
    }

    return await apiClient.get<SystemEventListResponse>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new system event
 */
export async function createSystemEvent(data: SystemEventCreate): Promise<SystemEventResponse> {
  try {
    return await apiClient.post<SystemEventResponse>(API_BASE, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches a single system event by ID
 */
export async function getSystemEvent(id: string): Promise<SystemEventResponse> {
  try {
    return await apiClient.get<SystemEventResponse>(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing system event
 */
export async function updateSystemEvent(
  id: string,
  data: SystemEventUpdate
): Promise<SystemEventResponse> {
  try {
    return await apiClient.patch<SystemEventResponse>(`${API_BASE}/${id}`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles system event status (active/inactive)
 */
export async function toggleSystemEventStatus(id: string): Promise<SystemEventResponse> {
  try {
    return await apiClient.patch<SystemEventResponse>(`${API_BASE}/${id}/toggle`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Deletes a system event
 */
export async function deleteSystemEvent(id: string): Promise<void> {
  try {
    await apiClient.delete(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches system event counts
 */
export async function getSystemEventCounts(): Promise<SystemEventCountsResponse> {
  try {
    return await apiClient.get<SystemEventCountsResponse>(`${API_BASE}/counts`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
