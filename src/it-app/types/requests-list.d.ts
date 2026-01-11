/**
 * Type definitions for the technician requests list page
 * Matches backend TechnicianViewsResponse schema
 */

export interface ViewItem {
  name: string;
  count: number;
}

export interface ViewCounts {
  // Existing views
  unassigned: number;
  allUnsolved: number;
  myUnsolved: number;
  recentlyUpdated: number;
  recentlySolved: number;
  // New views
  allYourRequests: number;
  urgentHighPriority: number;
  pendingRequesterResponse: number;
  pendingSubtask: number;
  newToday: number;
  inProgress: number;
}

export interface StatusInfo {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  color: string | null;
  countAsSolved?: boolean; // Whether this status counts as solved/completed
}

export interface RequesterInfo {
  id: string;  // UUID string from backend
  fullName: string | null;
}

export interface PriorityInfo {
  id: number;
  name: string;
  responseTimeMinutes: number;
  resolutionTimeHours: number;
}

export interface LastMessageInfo {
  content: string;
  senderName: string | null;
  createdAt: string; // ISO datetime string
}

export interface BusinessUnitInfo {
  id: number;
  name: string;
}

export interface TagInfo {
  id: number;
  nameEn: string;
  nameAr: string;
}

export interface CategoryInfo {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
}

export interface SubcategoryInfo {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
}

export interface RequestListItem {
  id: string; // UUID
  status: StatusInfo;
  subject: string;
  requester: RequesterInfo;
  requested: string; // ISO datetime string
  dueDate: string | null; // ISO datetime string - SLA-based due date
  priority: PriorityInfo;
  businessUnit: BusinessUnitInfo | null;
  lastMessage: LastMessageInfo | null;
  tag: TagInfo | null;
  category: CategoryInfo | null;
  subcategory: SubcategoryInfo | null;
  requesterHasUnread: boolean; // Whether requester has unread messages from technician (requester hasn't read)
  technicianHasUnread: boolean; // Whether technician has unread messages from requester (agent needs to read)

  // Sub-task fields
  parentTaskId?: string | null;
  isBlocked?: boolean;
  assignedToSectionId?: number | null;
  assignedToTechnicianId?: string | null;
  completedAt?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  order?: number | null;
  blockedReason?: string | null;
}

export interface TicketTypeCounts {
  all: number;
  parents: number;
  subtasks: number;
}

export interface TechnicianViewsResponse {
  data: RequestListItem[];
  counts: ViewCounts;
  filterCounts: TicketTypeCounts;
  total: number;
  page: number;
  perPage: number;
}

export type ViewType =
  // Existing views
  | 'unassigned'
  | 'all_unsolved'
  | 'my_unsolved'
  | 'recently_updated'
  | 'recently_solved'
  // New views
  | 'all_your_requests'
  | 'urgent_high_priority'
  | 'pending_requester_response'
  | 'pending_subtask'
  | 'new_today'
  | 'in_progress';

// Sub-task related types
export interface SubTaskStats {
  total: number;
  byStatus: Record<number, number>;
  blockedCount: number;
  overdueCount: number;
  completedCount: number;
}

// Ticket type counts (global, not filtered by view)
export interface TicketTypeCounts {
  all: number;
  parents: number;  // Tasks without parentTaskId
  subtasks: number; // Tasks with parentTaskId
}
