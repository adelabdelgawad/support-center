/**
 * TypeScript type definitions for the IT Support Center app
 *
 * These types match the backend API response format (camelCase)
 * since the backend uses HTTPSchemaModel which auto-converts to camelCase.
 *
 * To extend these types:
 * 1. Check the backend schema in backend/schemas/
 * 2. Add the corresponding TypeScript interface here
 * 3. Use camelCase for property names (matches JSON response)
 */

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string; // UUID
  username: string;
  email: string;
  fullName?: string;
  isActive: boolean;
  isTechnician: boolean;
  isSuperAdmin: boolean;
  isDomain: boolean;
  isBlocked: boolean;
  isOnline: boolean;
  managerId?: string; // UUID
  createdAt: string;
  updatedAt: string;
}

export interface MessageSender {
  id: string; // UUID
  username: string;
  fullName?: string;
  isTechnician: boolean;
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Device information for session tracking
 * Collected during login for security auditing
 */
export interface DeviceInfo {
  os: string;
  browser: string;
  user_agent: string;
  device_fingerprint?: string;
  app_version?: string;
  ip_address?: string; // Local IP address for accurate tracking
  computer_name?: string; // Computer hostname for identification
}

/**
 * AD Login request (username + password)
 */
export interface ADLoginRequest {
  username: string;
  password: string;
  device_info?: DeviceInfo;
  ip_address?: string;
}

/**
 * SSO Login request (username only, for domain users)
 */
export interface SSOLoginRequest {
  username: string;
  device_info?: DeviceInfo;
  ip_address?: string;
}

/**
 * Legacy LoginRequest alias for backward compatibility
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Login response from backend (camelCase from HTTPSchemaModel)
 */
export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: string; // DesktopSession UUID from backend
  redirectTo: string;
  user: User;
  refreshToken?: string; // Only for technician users
}

/**
 * Auth result wrapper for API responses
 */
export interface AuthResult {
  success: boolean;
  data?: LoginResponse;
  error?: string;
}

/**
 * Auth state for store
 */
export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  sessionId: string | null; // DesktopSession UUID from backend
}

// ============================================================================
// Version Enforcement Types (Phase 7/8 - Silent Upgrade)
// ============================================================================

/**
 * HTTP 426 response from backend when version enforcement rejects login
 */
export interface VersionEnforcementError {
  reason: "version_enforced";
  targetVersion: string;
  message: string;
  versionStatus: "outdated_enforced" | "unknown";
  currentVersion: string;
  installerUrl?: string;
  silentInstallArgs?: string;
}

/**
 * Update state for tracking upgrade progress
 */
export interface UpdateState {
  isUpdateRequired: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  downloadProgress: number;
  error: string | null;
  enforcementData: VersionEnforcementError | null;
}

/**
 * Result of checking for version enforcement
 */
export interface VersionCheckResult {
  enforced: boolean;
  enforcementData?: VersionEnforcementError;
}

// ============================================================================
// Service Request (Ticket) Types
// ============================================================================

export interface ServiceRequest {
  id: string; // UUID string
  requesterId: string; // UUID
  requester?: User;
  statusId: number;
  status?: RequestStatus;
  priorityId: number;
  priority?: Priority;
  title: string;
  description?: string;
  ipAddress?: string;
  computerName?: string;
  businessUnitId?: number;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
}

export interface CreateServiceRequest {
  title: string;
  tagId?: number;
  requestTypeId?: number;
}

export interface RequestStatus {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  color?: string;
  countAsSolved?: boolean;
}

export interface Priority {
  id: number;
  name: string;
  color?: string;
}

// ============================================================================
// Chat Message Types
// ============================================================================

export type MessageStatus = 'pending' | 'sent' | 'failed';

export interface ChatMessage {
  id: string; // UUID string
  requestId: string; // UUID string
  senderId: string | null; // UUID (optional)
  sender?: MessageSender;
  isReadByCurrentUser: boolean;
  content: string;
  sequenceNumber?: number; // Monotonic sequence number for message ordering
  isScreenshot: boolean;
  screenshotFileName?: string;
  isSystemMessage?: boolean; // Flag for system-generated messages
  createdAt: string;
  updatedAt: string;

  // File attachment fields (for files sent by IT agents)
  fileName?: string | null; // Original filename
  fileSize?: number | null; // File size in bytes
  fileMimeType?: string | null; // MIME type (e.g., "application/pdf")
  fileId?: number | null; // Reference to ChatFile in backend

  // Optimistic send support
  tempId?: string; // Client-generated ID for optimistic messages (e.g., uuid)
  status?: MessageStatus; // Message delivery status
  errorMessage?: string; // Error message when status is 'failed'
  clientTempId?: string; // Echo from server to match optimistic messages
}

export interface CreateChatMessage {
  requestId: string;
  content: string;
  isScreenshot?: boolean;
  screenshotFileName?: string;
  clientTempId?: string; // Client-generated ID to match optimistic messages
}


// ============================================================================
// Remote Access Types
// ============================================================================

/**
 * Remote access request data (received via SignalR)
 */
export interface RemoteAccessRequestData {
  sessionId: string;
  agentName: string;
  requestTitle: string;
  expiresAt: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ApiError {
  detail: string;
  code?: string;
}

// ============================================================================
// Ticket Page Types (matching Next.js app for migration)
// ============================================================================

/**
 * Transformed ticket for display in the ticket list
 * This is the UI-friendly version of ChatMessageListItem from the API
 */
export interface TicketListItem {
  id: string;
  subject: string;
  description?: string;
  statusId: number;  // NEW: Status ID
  status: string | RequestStatus; // Can be string or full status object
  statusColor?: string;
  countAsSolved?: boolean; // Whether this status counts as solved/completed
  chatStatus: "read" | "unread";
  technicianName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request status with count for filter buttons
 */
export interface RequestStatusCount {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  count: number;
  color?: string;
}

/**
 * Filter parameters for ticket list (URL-driven)
 */
export interface TicketFilterParams {
  statusFilter?: number;
  readFilter?: "read" | "unread";
}

/**
 * Chat message list item from API (raw response)
 */
export interface ChatMessageListItem {
  id: string;
  title: string;
  statusId: number;  // NEW: Status ID
  status: string | RequestStatus; // Can be string or full status object
  statusColor?: string;
  countAsSolved?: boolean; // Whether this status counts as solved/completed
  technicianName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  createdAt?: string; // Ticket creation date
  unreadCount: number;
}

/**
 * Chat messages count record from API
 */
export interface ChatMessageCountRecord {
  statusId: number;
  count: number;
}

/**
 * Full response from /chat/page-data endpoint
 */
export interface ChatPageResponse {
  requestStatus: RequestStatusCount[];
  chatMessagesCount: ChatMessageCountRecord[];
  chatMessages: ChatMessageListItem[];
  statuses: RequestStatus[];
}

/**
 * Ticket page data (transformed for UI)
 */
export interface TicketPageData {
  tickets: TicketListItem[];
  requestStatuses: RequestStatusCount[];
  rawResponse: ChatPageResponse;
}

/**
 * User info for ticket page display
 */
export interface TicketPageUser {
  id: string; // UUID
  username: string;
  fullName?: string;
  email?: string;
  role?: string;
}

/**
 * Ticket update payload (received via SignalR)
 */
export interface TicketUpdatePayload {
  requestId: string;
  status?: string;
  statusColor?: string;
  technicianName?: string;
  assignedAt?: string;
}

/**
 * Chat message payload for ticket list updates (received via SignalR)
 */
export interface ChatMessagePayload {
  requestId: string;
  message: string;
  senderId: string; // UUID
  senderName?: string;
  createdAt: string;
}

// ============================================================================
// Notification System Types
// ============================================================================

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  timestamp: number;
  duration?: number;
}

export interface NotificationOptions {
  type?: NotificationType;
  duration?: number;
}

// ============================================================================
// Notification SignalR Types
// ============================================================================

/**
 * Connected message received when connecting to SignalR notification hub
 */
export interface ConnectedMessage {
  type: "connected";
  userId: string; // UUID
  subscribedRequests: string[];
  timestamp: string;
}

/**
 * New message notification with full message details
 */
export interface NewMessageNotification {
  type: "new_message_notification";
  requestId: string;
  message: {
    id: string;
    requestId: string;
    requestTitle: string;
    content: string;
    sender: {
      id: string; // UUID
      username: string;
      fullName: string;
    };
    sequenceNumber: number;
    createdAt: string;
  };
  timestamp: string;
}

/**
 * Union type for all notification SignalR messages
 */
export interface NotificationSignalRMessage {
  type:
    | "connected"
    | "new_message_notification"
    | "subscription_added"
    | "subscription_removed"
    | "pong";
  [key: string]: any;
}

/**
 * Message to set currently active chat (suppresses notifications)
 */
export interface SetActiveChatMessage {
  type: "set_active_chat";
  request_id: string | null;
}

/**
 * Message to refresh subscriptions from server
 */
export interface RefreshSubscriptionsMessage {
  type: "refresh_subscriptions";
}

// ============================================================================
// Tag Types (Request Classification)
// ============================================================================

/**
 * Category for organizing tags
 */
export interface Category {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  subcategories?: Subcategory[];
  tags?: Tag[];
}

/**
 * Subcategory for organizing tags within a category
 */
export interface Subcategory {
  id: number;
  categoryId: number;
  name: string;
  nameEn: string;
  nameAr: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Tag for request classification (bilingual support)
 */
export interface Tag {
  id: number;
  nameEn: string;
  nameAr: string;
  categoryId: number;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  category?: Category;
}

// ============================================================================
// Request Type Types
// ============================================================================

/**
 * Request Type for categorizing service requests
 * (e.g., Incident, Service Request, Problem, Change Request, Access Request)
 * Supports bilingual names and brief hints
 */
export interface RequestType {
  id: number;
  nameEn: string;
  nameAr: string;
  briefEn?: string;
  briefAr?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// SignalR Event Types
// ============================================================================

/**
 * Typing indicator event from SignalR
 */
export interface TypingIndicator {
  requestId: string;
  userId: string;
  username: string;
  isTyping: boolean;
  timestamp?: string;
}

/**
 * Read status update event from SignalR
 */
export interface ReadStatusUpdate {
  requestId: string;
  userId: string;
  messageIds: string[];
  timestamp?: string;
}

/**
 * Ticket update event from SignalR
 */
export interface TicketUpdateEvent {
  requestId: string;
  type: string;
  statusId?: number;
  statusName?: string;
  statusColor?: string;
  assignedToId?: string;
  assignedToName?: string;
  updatedBy?: string;
  timestamp?: string;
}

/**
 * Task status changed event from SignalR
 */
export interface TaskStatusChangedEvent {
  requestId: string;
  status: string;
  changedBy: string;
  timestamp?: string;
}

