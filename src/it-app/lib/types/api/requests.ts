/**
 * API types for technician requests (tickets).
 * Matches backend schemas in api/schemas/technician_views.py
 *
 * IMPORTANT: Backend uses CamelModel which auto-converts snake_case to camelCase.
 * All field names here must be camelCase to match actual API responses.
 */

export interface RequesterInfo {
  id: string; // UUID
  fullName: string | null;
}

export interface StatusInfo {
  id: number;
  name: string;
  color: string | null;
  countAsSolved: boolean;
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
  createdAt: string; // ISO datetime
  sequenceNumber: number;
}

export interface BusinessUnitInfo {
  id: number;
  name: string;
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

/**
 * Single ticket/item in technician views list
 */
export interface TicketListItem {
  id: number;
  status: StatusInfo;
  subject: string;
  requester: RequesterInfo;
  requested: string; // ISO datetime
  requestedDuration: string; // Formatted like "5 hours ago", "Just now"
  dueDate: string | null; // ISO datetime - SLA-based due date
  dueDateDuration: string; // Formatted like "in 5h", "2d 3h overdue"
  isDueDateOverdue: boolean;
  priority: PriorityInfo;
  lastMessage: LastMessageInfo | null;
  businessUnit: BusinessUnitInfo | null;
  category: CategoryInfo | null;
  subcategory: SubcategoryInfo | null;
  requesterHasUnread: boolean;
  technicianHasUnread: boolean;

  // Sub-task fields
  parentTaskId: string | null; // UUID
  isBlocked: boolean;
  assignedToSectionId: number | null;
  assignedToTechnicianId: string | null; // UUID
  completedAt: string | null; // ISO datetime
  estimatedHours: number | null;
}

/**
 * Counts for all view types (sidebar navigation)
 */
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
  // Additional views
  allTickets: number;
  allSolved: number;
}

/**
 * Ticket type filter counts (All/Parents/Subtasks)
 */
export interface TicketTypeCounts {
  all: number;
  parents: number;
  subtasks: number;
}

/**
 * Business unit with count for filtering
 */
export interface BusinessUnitCount {
  id: number;
  name: string;
  count: number;
}

/**
 * Response from /technician-views endpoint
 */
export interface TechnicianViewsResponse {
  data: TicketListItem[];
  counts: ViewCounts;
  filterCounts: TicketTypeCounts;
  total: number;
  page: number;
  perPage: number;
}

/**
 * Consolidated response from /technician-views-consolidated endpoint
 * Includes tickets data + view counts + business unit counts in one response
 */
export interface TechnicianViewsConsolidatedResponse {
  data: TicketListItem[];
  counts: ViewCounts;
  filterCounts: TicketTypeCounts;
  total: number;
  page: number;
  perPage: number;

  // Business unit data (from /business-unit-counts endpoint)
  businessUnits: BusinessUnitCount[];
  businessUnitsTotal: number;
  unassignedCount: number;
}

/**
 * View type for filtering
 */
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
  | 'in_progress'
  // Additional views
  | 'all_tickets'
  | 'all_solved';

/**
 * Mapping from ViewType (backend snake_case view names) to camelCase ViewCounts keys
 */
export const VIEW_TO_COUNTS_KEY: Record<ViewType, keyof ViewCounts> = {
  unassigned: 'unassigned',
  all_unsolved: 'allUnsolved',
  my_unsolved: 'myUnsolved',
  recently_updated: 'recentlyUpdated',
  recently_solved: 'recentlySolved',
  all_your_requests: 'allYourRequests',
  urgent_high_priority: 'urgentHighPriority',
  pending_requester_response: 'pendingRequesterResponse',
  pending_subtask: 'pendingSubtask',
  new_today: 'newToday',
  in_progress: 'inProgress',
  all_tickets: 'allTickets',
  all_solved: 'allSolved',
} as const;

/**
 * View display names for UI
 */
export const VIEW_DISPLAY_NAMES: Record<ViewType, string> = {
  unassigned: 'Unassigned tickets',
  all_unsolved: 'All unsolved tickets',
  my_unsolved: 'Your unsolved tickets',
  recently_updated: 'Recently updated tickets',
  recently_solved: 'Recently solved tickets',
  all_your_requests: 'All your requests',
  urgent_high_priority: 'Urgent / High priority',
  pending_requester_response: 'Pending requester response',
  pending_subtask: 'Pending subtask',
  new_today: 'New today',
  in_progress: 'In progress',
  all_tickets: 'All tickets',
  all_solved: 'All solved tickets',
} as const;
