'use server';

import { internalGet, internalPost, internalPatch, internalDelete } from '@/lib/fetch';
import type {
  SystemMessageResponse,
  SystemMessageListResponse,
  SystemMessageCreate,
  SystemMessageUpdate,
} from '@/types/system-messages';

/**
 * Fetches system messages with pagination and filtering capabilities
 * Used for server-side rendering and initial data loading
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
 */
export async function getSystemMessages(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: boolean;
    [key: string]: boolean | undefined;
  };
}): Promise<SystemMessageListResponse> {
  const queryParams = new URLSearchParams();

  // Add skip and limit directly (backend uses skip/limit, not page/per_page)
  queryParams.append('skip', params?.skip.toString() ?? '0');
  queryParams.append('limit', params?.limit.toString() ?? '20');

  // Add filter criteria
  if (params?.filterCriteria) {
    Object.entries(params.filterCriteria).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
  }

  return internalGet<SystemMessageListResponse>(
    `/api/setting/system-messages?${queryParams}`
  );
}

/**
 * Creates a new system message
 */
export async function createSystemMessage(
  data: SystemMessageCreate
): Promise<SystemMessageResponse> {
  return internalPost<SystemMessageResponse>(
    '/api/setting/system-messages',
    data
  );
}

/**
 * Fetches a single system message by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getSystemMessage(id: string): Promise<SystemMessageResponse> {
  return internalGet<SystemMessageResponse>(
    `/api/setting/system-messages/${id}`
  );
}

/**
 * Updates an existing system message
 */
export async function updateSystemMessage(
  id: string,
  data: SystemMessageUpdate
): Promise<SystemMessageResponse> {
  return internalPatch<SystemMessageResponse>(
    `/api/setting/system-messages/${id}`,
    data
  );
}

/**
 * Toggles system message status (active/inactive)
 */
export async function toggleSystemMessageStatus(id: string): Promise<SystemMessageResponse> {
  return internalPatch<SystemMessageResponse>(
    `/api/setting/system-messages/${id}/toggle`
  );
}

/**
 * Deletes a system message
 */
export async function deleteSystemMessage(id: string): Promise<void> {
  await internalDelete(`/api/setting/system-messages/${id}`);
}
