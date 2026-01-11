/**
 * Shared type definitions for the tickets/requests page
 * Matches backend TechnicianViewsResponse schema
 */

export interface ViewItem {
  name: string;
  count: number;
}

export interface ViewCounts {
  unassigned: number;
  allUnsolved: number;
  myUnsolved: number;
  recentlyUpdated: number;
  recentlySolved: number;
}

export interface StatusInfo {
  id: number;
  name: string;
  color: string | null;
}

export interface RequesterInfo {
  id: number;
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

export interface Ticket {
  id: string; // UUID
  status: StatusInfo;
  subject: string;
  requester: RequesterInfo;
  requested: string; // ISO datetime string
  priority: PriorityInfo;
  lastMessage: LastMessageInfo | null;
}

export interface TechnicianViewsResponse {
  data: Ticket[];
  counts: ViewCounts;
  total: number;
  page: number;
  perPage: number;
}

export type ViewType =
  | 'unassigned'
  | 'all_unsolved'
  | 'my_unsolved'
  | 'recently_updated'
  | 'recently_solved';

// Legacy types (kept for backward compatibility if needed)
export type TicketStatus = 'Open' | 'Pending' | 'Solved' | 'Closed';
export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

/**
 * Full ticket detail response from backend
 */
export interface TicketDetailResponse {
  id: string; // UUID
  subcategoryId: number | null;
  serviceSectionId: number | null;
  title: string;
  description: string | null;
  priorityId: number;
  resolution: string | null;
  ipAddress: string | null;
  computerName: string | null;
  businessUnitId: number | null;
  requesterId: number;
  statusId: number;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  assignedAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  requesterUsername: string | null;
  chatMessagesCount: number;
  attachmentsCount: number;
  responseTimeHours: number | null;
  resolutionTimeHours: number | null;
}

/**
 * Chat message from backend
 */
export interface ChatMessage {
  id: number;
  requestId: string; // UUID
  senderId: number;
  content: string;
  isScreenshot: boolean;
  screenshotFileName: string | null;
  isRead: boolean;
  isReadByCurrentUser: boolean;
  attachmentCount: number;
  createdAt: string; // ISO datetime
  updatedAt: string | null;
  readAt: string | null;
  attachments: ChatAttachment[];
}

/**
 * Chat attachment
 */
export interface ChatAttachment {
  id: number;
  filename: string;
  fileSize: number;
  mimeType: string;
  isCorrupted: boolean;
  createdAt: string; // ISO datetime
}
