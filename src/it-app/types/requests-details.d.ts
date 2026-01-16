/**
 * Type definitions for request details page
 * Located at: /support-center/requests/(details)/[id]
 *
 * Re-exports shared types and defines page-specific types
 */

// Re-export shared types that are used by this page
export type { ServiceRequestDetail, MessageData, UserData } from './ticket-detail';
export type { Technician, Priority, RequestNote, CreateNoteData, RequestStatus } from './metadata';

// Import for internal use
import type { ServiceRequestDetail } from './ticket-detail';
import type { Technician, Priority, RequestNote, RequestStatus } from './metadata';
import type { ChatMessage } from '@/lib/signalr/types';
import type { Assignee } from '@/lib/hooks/use-request-assignees';
import type { PermissionResult } from '@/lib/utils/messaging-permissions';
import type { AttachmentUploadResult, AttachmentUploadResponse } from '@/lib/hooks/use-chat-mutations';
import type { SubTask, SubTaskStats } from './sub-task';
import type { ScreenshotItem } from './media-viewer';
// Connection status type - now part of SignalR context
export type ConnectionAlertLevel = 'none' | 'info' | 'warning' | 'error';
import type { Category } from '@/lib/hooks/use-categories-tags';

/**
 * Complete page data fetched server-side
 */
export interface RequestDetailsPageData {
  ticket: ServiceRequestDetail;
  technicians: Technician[];
  priorities: Priority[];
  statuses: RequestStatus[];
  categories: Category[];  // Categories with subcategories for dropdown
  notes: RequestNote[];
  assignees: Assignee[];
  initialMessages: ChatMessage[];
  currentUserId?: string;  // Changed from number to string UUID
  currentUserIsTechnician?: boolean;  // From SSR cookie data for messaging permissions
  subTasks?: {
    items: SubTask[];
    total: number;
    stats: SubTaskStats;
  };
}

/**
 * Provider context type - what child components can access
 */
export interface RequestDetailsContextType {
  // Ticket data
  ticket: ServiceRequestDetail;

  // Metadata (fetched server-side)
  technicians: Technician[];
  priorities: Priority[];
  statuses: RequestStatus[];
  categories: Category[];  // Categories with subcategories for dropdown

  // Notes (managed by SWR)
  notes: RequestNote[];
  notesLoading: boolean;
  addNote: (noteText: string) => Promise<RequestNote>;

  // Assignees (managed by SWR)
  assignees: Assignee[];
  assigneesLoading: boolean;
  addAssignee: (technicianId: string, technicianName: string, technicianTitle?: string) => Promise<void>;  // Changed from number to string UUID
  removeAssignee: (technicianId: string) => Promise<void>;  // Changed from number to string UUID
  takeRequest: () => Promise<void>;
  canEditAssignees: boolean; // @deprecated - use canAddAssignees/canRemoveAssignees
  canAddAssignees: boolean;  // Can add more assignees (assigned technician OR supervisor)
  canRemoveAssignees: boolean;  // Can remove assignees (supervisor only)
  canTakeRequest: boolean;

  // Current user ID
  currentUserId?: string;  // Changed from number to string UUID

  // Current user info for take request and chat
  currentUser?: {
    id: string;  // Changed from number to string UUID
    username: string;
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
  };

  // Messages (from WebSocket)
  messages: ChatMessage[];
  messagesLoading: boolean;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  sendAttachmentMessage: (uploadResult: AttachmentUploadResult) => Promise<void>;
  retryMessage: (tempId: string) => void;
  discardFailedMessage: (tempId: string) => void;
  uploadAttachments: (files: File[]) => Promise<AttachmentUploadResponse | null>;
  sendingMessage: boolean;
  uploadingAttachment: boolean;

  // SignalR connection status
  isSignalRConnected: boolean;
  /** Connection alert level for progressive UX (none/info/warning/error) */
  connectionAlertLevel: ConnectionAlertLevel;

  // Media Viewer (for screenshot viewing)
  mediaViewerOpen: boolean;
  mediaViewerIndex: number;
  screenshots: ScreenshotItem[];
  openMediaViewer: (screenshotFilename: string) => void;
  closeMediaViewer: () => void;
  navigateMediaViewer: (direction: 'next' | 'prev') => void;
  setMediaViewerIndex: (index: number) => void;

  // Ticket update actions (SWR-managed with optimistic updates)
  updateTicketStatus: (statusId: number, resolution?: string) => Promise<ServiceRequestDetail | void>;
  updateTicketPriority: (priorityId: number) => Promise<ServiceRequestDetail | void>;
  updatingTicket: boolean;
  isUpdatingStatus: boolean;

  // Status update permission
  // True if current user can update status (super_admin or assigned technician)
  canUpdateStatus: boolean;

  // Request details edit permission
  // True if current user can edit status, category, subcategory, notes
  // (assignee, senior, supervisor, or admin)
  canEditRequestDetails: boolean;

  // Chat reload warning
  chatNeedsReload: boolean;
  dismissReloadWarning: () => void;

  // **MESSAGING PERMISSIONS**
  messagingPermission: PermissionResult;

  // **CHAT DISABLED STATE**
  // True if chat is disabled due to ticket status (solved, closed, archived)
  isChatDisabled: boolean;
  chatDisabledReason?: string;

  // **SUB-TASKS** (from SSR, passed to SubTasksPanel)
  initialSubTasks?: {
    items: SubTask[];
    total: number;
    stats: SubTaskStats;
  };

  // **SCROLL HANDLER REGISTRATION**
  // TicketMessages registers scroll handler to enable auto-scroll on new SignalR messages
  registerScrollHandler: (handler: (() => void) | null) => void;
  // Force scroll handler for when user sends their own message (always scrolls)
  registerForceScrollHandler: (handler: (() => void) | null) => void;

  // **CACHE INTEGRATION**
  // WhatsApp-style local cache state
  cacheInitialized: boolean; // True when IndexedDB cache is ready
  isSyncing: boolean; // True when delta sync is in progress
  syncError: string | null; // Error message if sync failed
}

/**
 * Payload types for client actions
 */
export interface CreateNotePayload {
  requestId: string;
  note: string;
}

export interface UpdateNotePayload {
  note: string;
}

export interface UpdateTicketStatusPayload {
  statusId: number;
  resolution?: string;
}

export interface UpdateTicketPriorityPayload {
  priorityId: number;
}

export interface AssignTechnicianPayload {
  technicianId: string;  // Changed from number to string UUID
}

export interface SendMessagePayload {
  requestId: string;
  senderId: string;  // Changed from number to string UUID
  content: string;
}

/**
 * API response types
 */
export interface UpdateTicketResponse {
  success: boolean;
  message?: string;
  ticket?: ServiceRequestDetail;
}

export interface NoteActionResponse {
  success: boolean;
  note?: RequestNote;
  message?: string;
}

export {};
