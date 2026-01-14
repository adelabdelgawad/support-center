/**
 * Request Details Page API Client
 *
 * Client-side API wrapper for fetching full request details page data.
 * Calls Next.js API routes (NOT backend directly)
 */

import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Technician, Priority, RequestNote, RequestStatus } from '@/types/metadata';
import type { ChatMessage } from '@/lib/signalr/types';
import type { Assignee } from '@/lib/hooks/use-request-assignees';
import type { Category } from '@/lib/hooks/use-categories-tags';
import type { SubTask, SubTaskStats } from '@/types/sub-task';

interface BackendAssignee {
  id: number;
  userId: string;
  username: string;
  fullName: string | null;
  title: string | null;
  assignTypeId: number;
  assignedBy: string | null;
  assignedByName: string | null;
  createdAt: string;
}

interface FullDetailsResponse {
  ticket: ServiceRequestDetail;
  notes: RequestNote[];
  assignees: BackendAssignee[];
  initialMessages: ChatMessage[];
  subTasks: SubTask[];
  subTaskStats: {
    total: number;
    byStatus: Record<string, number>;
    blockedCount: number;
    overdueCount: number;
    completedCount: number;
  };
  fetchedAt: string;
}

export interface RequestDetailsPageData {
  ticket: ServiceRequestDetail;
  technicians: Technician[];
  priorities: Priority[];
  statuses: RequestStatus[];
  categories: Category[];
  notes: RequestNote[];
  assignees: Assignee[];
  initialMessages: ChatMessage[];
  currentUserId?: string;
  currentUserIsTechnician: boolean;
  subTasks: {
    items: SubTask[];
    total: number;
    stats: SubTaskStats;
  };
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
    assignTypeId: item.assignTypeId,
    assignedBy: item.assignedBy,
    assignedByName: item.assignedByName,
    createdAt: item.createdAt,
  };
}

/**
 * Fetch full request details
 */
export async function fetchFullRequestDetails(requestId: string): Promise<FullDetailsResponse | null> {
  const response = await fetch(`/api/requests-details/${requestId}/full-details`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch request details: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Consolidated metadata response
 */
interface RequestDetailsMetadata {
  priorities: Priority[];
  statuses: RequestStatus[];
  technicians: Technician[];
  categories: Category[];
}

/**
 * Fetch all metadata for request details page in one call
 */
export async function fetchRequestDetailsMetadata(): Promise<RequestDetailsMetadata> {
  const response = await fetch('/api/request-details-metadata', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    return {
      priorities: [],
      statuses: [],
      technicians: [],
      categories: [],
    };
  }

  return response.json();
}

/**
 * Fetch all request details page data
 */
export async function fetchRequestDetailsPageData(
  requestId: string,
  currentUserId?: string,
  currentUserIsTechnician: boolean = false
): Promise<RequestDetailsPageData | null> {
  try {
    // Fetch all data in parallel - now only 2 API calls instead of 5!
    const [fullDetails, metadata] = await Promise.all([
      fetchFullRequestDetails(requestId),
      fetchRequestDetailsMetadata(),
    ]);

    if (!fullDetails || !fullDetails.ticket) {
      return null;
    }

    // Transform assignees
    const transformedAssignees = (fullDetails.assignees || []).map(transformAssignee);

    // Transform sub-task stats
    const subTaskStats = fullDetails.subTaskStats || {
      total: 0,
      byStatus: {},
      blockedCount: 0,
      overdueCount: 0,
      completedCount: 0,
    };

    return {
      ticket: fullDetails.ticket,
      technicians: metadata.technicians,
      priorities: metadata.priorities,
      statuses: metadata.statuses,
      categories: metadata.categories,
      notes: fullDetails.notes || [],
      assignees: transformedAssignees,
      initialMessages: fullDetails.initialMessages || [],
      currentUserId,
      currentUserIsTechnician,
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
    return null;
  }
}
