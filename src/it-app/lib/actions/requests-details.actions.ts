'use server';

/**
 * Server actions for request details page
 * These functions use internalGet/internalPost/etc to call Next.js API routes
 * Used by page.tsx for server-side data fetching
 */

import { redirect } from 'next/navigation';
import { getServerUserInfo } from '@/lib/api/server-fetch';
import { internalGet, internalPost, internalPatch } from '@/lib/fetch';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Technician, Priority, RequestNote, RequestStatus } from '@/types/metadata';
import type { ChatMessage } from '@/lib/signalr/types';
import type { RequestDetailsPageData } from '@/types/requests-details';
import type { Assignee } from '@/lib/hooks/use-request-assignees';
import type { Category } from '@/lib/hooks/use-categories';

/**
 * Fetch request/ticket details by ID
 *
 * Cache: NO_CACHE (real-time ticket data)
 */
export async function getRequestDetails(requestId: string): Promise<ServiceRequestDetail | null> {
  try {
    const ticket = await internalGet<ServiceRequestDetail>(
      `/api/requests/${requestId}`
    );
    return ticket;
  } catch (error) {
    console.error('Error fetching request details:', error);
    return null;
  }
}

/**
 * Fetch notes for a request
 *
 * Cache: NO_CACHE (frequently updated)
 */
export async function getRequestNotes(requestId: string): Promise<RequestNote[]> {
  try {
    const notes = await internalGet<RequestNote[]>(
      `/api/request-notes/${requestId}`
    );
    return notes;
  } catch (error) {
    console.error('Error fetching request notes:', error);
    return [];
  }
}

/**
 * Fetch active technicians for assignment dropdown
 *
 * Cache: 1 minute (list may change)
 */
export async function getTechnicians(): Promise<Technician[]> {
  try {
    const technicians = await internalGet<Technician[]>(
      '/api/users?is_technician=true&is_active=true'
    );
    return technicians;
  } catch (error) {
    console.error('Error fetching technicians:', error);
    return [];
  }
}

/**
 * Fetch priorities (cached)
 *
 * Cache: 10 minutes (reference data, rarely changes)
 * Invalidate via: revalidateTag('reference:priorities', {})
 */
export async function getPriorities(): Promise<Priority[]> {
  try {
    const priorities = await internalGet<Priority[]>(
      '/api/priorities'
    );
    return priorities;
  } catch (error) {
    console.error('Error fetching priorities:', error);
    return [];
  }
}

/**
 * Fetch request statuses (active only)
 *
 * Cache: 10 minutes (reference data, rarely changes)
 * Invalidate via: revalidateTag('reference:statuses', {})
 */
export async function getStatuses(): Promise<RequestStatus[]> {
  try {
    const response = await internalGet<{
      statuses: RequestStatus[];
      total: number;
      activeCount: number;
      inactiveCount: number;
      readonlyCount: number;
    }>(
      '/api/request-statuses?is_active=true'
    );

    return response.statuses;
  } catch (error) {
    console.error('Error fetching statuses:', error);
    return [];
  }
}

/**
 * Fetch categories with subcategories for dropdown
 *
 * Cache: 10 minutes (reference data, rarely changes)
 * Invalidate via: revalidateTag('reference:categories', {})
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const categories = await internalGet<Category[]>(
      '/api/categories?active_only=true&include_subcategories=true'
    );

    return categories || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

/**
 * Fetch initial chat messages for a request
 *
 * Cache: NO_CACHE (real-time chat data)
 */
export async function getRequestMessages(
  requestId: string,
  page: number = 1,
  perPage: number = 100
): Promise<ChatMessage[]> {
  try {
    const messages = await internalGet<ChatMessage[]>(
      `/api/chat/messages/request/${requestId}?page=${page}&per_page=${perPage}`
    );
    return messages;
  } catch (error) {
    console.error('Error fetching request messages:', error);
    return [];
  }
}

/**
 * Backend response type for assignees
 */
interface BackendAssignee {
  id: number;
  userId: string;
  username: string;
  fullName: string | null;
  title: string | null;
  office: string | null;
  assignTypeId: number;
  assignedBy: string | null;
  assignedByName: string | null;
  createdAt: string;
}

/**
 * Backend response wrapper for assignees endpoint
 */
interface AssigneesResponse {
  requestId: number;
  assignees: BackendAssignee[];
  total: number;
}

/**
 * Transform backend assignee to frontend format
 */
function transformAssignee(item: BackendAssignee): Assignee {
  return {
    id: item.id,
    userId: item.userId,
    username: item.username,
    fullName: item.fullName,
    title: item.title,
    office: item.office ?? null,
    assignTypeId: item.assignTypeId,
    assignedBy: item.assignedBy,
    assignedByName: item.assignedByName,
    createdAt: item.createdAt,
  };
}

/**
 * Fetch assignees for a request
 *
 * Cache: NO_CACHE (may change frequently)
 */
export async function getRequestAssignees(requestId: string): Promise<Assignee[]> {
  try {
    const response = await internalGet<AssigneesResponse>(
      `/api/requests-details/${requestId}/assignees`
    );
    return (response.assignees || []).map(transformAssignee);
  } catch (error) {
    console.error('Error fetching request assignees:', error);
    return [];
  }
}


/**
 * Backend response type for the combined full-details endpoint
 */
interface FullDetailsResponse {
  ticket: ServiceRequestDetail;
  notes: RequestNote[];
  assignees: BackendAssignee[];
  initialMessages: ChatMessage[];
  subTasks: any[];
  subTaskStats: {
    total: number;
    byStatus: Record<string, number>;
    blockedCount: number;
    overdueCount: number;
    completedCount: number;
  };
  fetchedAt: string;
}

/**
 * Fetch ALL request details in a SINGLE API call (optimized)
 *
 * Cache: NO_CACHE (combines multiple real-time data sources)
 */
async function getFullRequestDetails(requestId: string): Promise<FullDetailsResponse | null> {
  try {
    const response = await internalGet<FullDetailsResponse>(
      `/api/requests-details/${requestId}/full-details`
    );
    return response;
  } catch (error) {
    console.error('Error fetching full request details:', error);
    return null;
  }
}

/**
 * Mark chat as read for a request (called during SSR page load)
 * Note: Client-side fallback exists in request-detail-context.tsx if this fails
 */
async function markChatAsReadServer(requestId: string): Promise<void> {
  try {
    await internalPost<any>(
      `/api/chat/${requestId}/mark-read`
    );
  } catch {
    // Silent failure - client-side fallback will handle this case
  }
}

/**
 * Fetch sub-tasks data for a request (legacy - used as fallback)
 *
 * Cache: NO_CACHE (sub-tasks may change)
 */
async function getRequestSubTasks(requestId: string): Promise<{ items: any[]; total: number; stats: any }> {
  try {
    const [subTasksResponse, statsResponse] = await Promise.all([
      internalGet<any[]>(
        `/api/requests/${requestId}/sub-tasks?skip=0&limit=20`
      ),
      internalGet<any>(
        `/api/requests/${requestId}/sub-tasks/stats`
      ),
    ]);

    return {
      items: subTasksResponse || [],
      total: Array.isArray(subTasksResponse) ? subTasksResponse.length : 0,
      stats: statsResponse || { total: 0, open: 0, inProgress: 0, completed: 0, blocked: 0, overdue: 0 },
    };
  } catch (error) {
    console.error('Error fetching sub-tasks:', error);
    return {
      items: [],
      total: 0,
      stats: { total: 0, open: 0, inProgress: 0, completed: 0, blocked: 0, overdue: 0 },
    };
  }
}

/**
 * Fetch ALL request details page data using OPTIMIZED combined endpoint
 *
 * PERFORMANCE OPTIMIZATION:
 * - Uses new /requests/{id}/full-details endpoint for ticket data
 * - Fetches metadata (priorities, statuses, technicians) in parallel on SSR
 * - All data available immediately on page load - NO loading states
 * - Metadata passed as SWR fallbackData for cache seeding
 */
export async function getRequestDetailsPageData(
  requestId: string
): Promise<RequestDetailsPageData | null> {
  try {
    // Get current user info from server-side cookie
    const currentUser = await getServerUserInfo();
    const currentUserId = currentUser?.id;

    // Fetch ALL data in parallel on server - no client-side loading states
    // Also mark chat as read during SSR (removes orange highlight from list)
    const [fullDetails, priorities, statuses, technicians, categories, _markRead] = await Promise.all([
      getFullRequestDetails(requestId),
      getPriorities(),
      getStatuses(),
      getTechnicians(),
      getCategories(),
      markChatAsReadServer(requestId),
    ]);

    // If request not found, return null
    if (!fullDetails || !fullDetails.ticket) {
      return null;
    }

    // Transform assignees to frontend format
    const transformedAssignees = (fullDetails.assignees || []).map(transformAssignee);

    // Transform sub-task stats to expected format
    const subTaskStats = fullDetails.subTaskStats || {
      total: 0,
      byStatus: {},
      blockedCount: 0,
      overdueCount: 0,
      completedCount: 0,
    };

    return {
      ticket: fullDetails.ticket,
      technicians,
      priorities,
      statuses,
      categories,
      sections: [],
      notes: fullDetails.notes || [],
      assignees: transformedAssignees,
      initialMessages: fullDetails.initialMessages || [],
      currentUserId,
      currentUserIsTechnician: currentUser?.isTechnician ?? false,
      subTasks: {
        items: fullDetails.subTasks || [],
        total: subTaskStats.total,
        stats: {
          total: subTaskStats.total,
          open: subTaskStats.byStatus?.['1'] || 0,
          inProgress: subTaskStats.byStatus?.['8'] || 0,
          completed: subTaskStats.completedCount || 0,
          blocked: subTaskStats.blockedCount || 0,
          overdue: subTaskStats.overdueCount || 0,
        },
      },
    };
  } catch (error) {
    console.error('Error fetching request details page data:', error);

    // Handle auth errors
    if (error && typeof error === 'object' && 'status' in error) {
      const statusError = error as { status?: number };
      if (statusError.status === 401) {
        redirect('/login');
      }
      if (statusError.status === 404) {
        redirect('/support-center/requests');
      }
    }

    return null;
  }
}

/**
 * Server action to create a note
 */
export async function createNoteServerAction(
  requestId: string,
  note: string
): Promise<RequestNote | null> {
  try {
    const newNote = await internalPost<RequestNote>(
      `/api/request-notes/${requestId}`,
      { note }
    );
    return newNote;
  } catch (error) {
    console.error('Error creating note:', error);
    return null;
  }
}

/**
 * Server action to update ticket status
 */
export async function updateTicketStatusServerAction(
  requestId: string,
  statusId: number,
  resolution?: string
): Promise<ServiceRequestDetail | null> {
  try {
    const payload: any = { status_id: statusId };
    if (resolution) {
      payload.resolution = resolution;
    }

    const updatedTicket = await internalPatch<ServiceRequestDetail>(
      `/api/requests/${requestId}`,
      payload
    );
    return updatedTicket;
  } catch (error) {
    console.error('Error updating ticket status:', error);
    return null;
  }
}

/**
 * Server action to update ticket priority
 */
export async function updateTicketPriorityServerAction(
  requestId: string,
  priorityId: number
): Promise<ServiceRequestDetail | null> {
  try {
    const updatedTicket = await internalPatch<ServiceRequestDetail>(
      `/api/requests/${requestId}`,
      { priority_id: priorityId }
    );
    return updatedTicket;
  } catch (error) {
    console.error('Error updating ticket priority:', error);
    return null;
  }
}

/**
 * Server action to assign technician
 */
export async function assignTechnicianServerAction(
  requestId: string,
  technicianId: number
): Promise<boolean> {
  try {
    await internalPost(
      `/api/requests-details/${requestId}/assign`,
      { technician_id: technicianId }
    );
    return true;
  } catch (error) {
    console.error('Error assigning technician:', error);
    return false;
  }
}
