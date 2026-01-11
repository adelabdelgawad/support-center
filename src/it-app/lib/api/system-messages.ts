'use client';

/**
 * Client-side API for system messages
 * All calls go through Next.js API routes (/api/setting/system-messages/*)
 * which then proxy to the backend. This ensures the backend is only
 * accessible from the server.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  SystemMessageResponse,
  SystemMessageCreate,
  SystemMessageUpdate,
} from '@/types/system-messages';

const API_BASE = '/api/setting/system-messages';

/**
 * Fetches system messages with pagination and filtering capabilities
 */
export async function getSystemMessages(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    message_type?: string;
    [key: string]: string | undefined;
  };
}): Promise<SystemMessageResponse[]> {
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

    return await apiClient.get<SystemMessageResponse[]>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new system message
 */
export async function createSystemMessage(data: SystemMessageCreate): Promise<SystemMessageResponse> {
  try {
    return await apiClient.post<SystemMessageResponse>(API_BASE, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches a single system message by ID
 */
export async function getSystemMessage(id: string): Promise<SystemMessageResponse> {
  try {
    return await apiClient.get<SystemMessageResponse>(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing system message
 */
export async function updateSystemMessage(
  id: string,
  data: SystemMessageUpdate
): Promise<SystemMessageResponse> {
  try {
    return await apiClient.patch<SystemMessageResponse>(`${API_BASE}/${id}`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles system message status (active/inactive)
 */
export async function toggleSystemMessageStatus(id: string): Promise<SystemMessageResponse> {
  try {
    return await apiClient.patch<SystemMessageResponse>(`${API_BASE}/${id}/toggle`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Deletes a system message
 */
export async function deleteSystemMessage(id: string): Promise<void> {
  try {
    await apiClient.delete(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Bulk update system message status
 */
export async function bulkUpdateSystemMessageStatus(
  messageIds: number[],
  isActive: boolean
): Promise<SystemMessageResponse[]> {
  try {
    return await apiClient.post<SystemMessageResponse[]>(`${API_BASE}/bulk-status`, {
      message_ids: messageIds,
      is_active: isActive,
    });
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
