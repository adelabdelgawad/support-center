/**
 * SignalR Event Types
 *
 * Types for real-time events transmitted via SignalR.
 */

// Sender information for chat messages
export interface SenderInfo {
  id: string;
  username?: string;
  fullName: string | null;
  email?: string | null;
  avatarUrl?: string;
  role?: string;
}

// Chat message structure
export interface ChatMessage {
  id: string;
  requestId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  messageType?: 'user' | 'system' | 'note';
  createdAt: string;
  updatedAt?: string | null;
  isRead: boolean;
  readAt?: string | null;
  sequenceNumber: number;
  optimistic?: boolean;
  tempId?: string;
  sender?: SenderInfo | null;
  screenshotFileName?: string | null;
  isScreenshot?: boolean;
  status?: 'sending' | 'sent' | 'failed' | 'pending';
  errorMessage?: string; // Error message for failed messages (for retry UI)
  clientTempId?: string;
  attachmentCount?: number;
  attachments?: unknown[];
  // File attachment fields (for non-image files)
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
}

// Typing indicator event
export interface TypingIndicator {
  requestId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

// Read status update event
export interface ReadStatusUpdate {
  requestId: string;
  messageIds: string[];
  readBy: string;
  readAt: string;
}

// Ticket update event
export interface TicketUpdateEvent {
  requestId: string;
  eventType: 'status_change' | 'priority_change' | 'assignment' | 'note_added' | 'fields_updated';
  data: Record<string, unknown>;
}

// Task status changed event
export interface TaskStatusChangedEvent {
  requestId: string;
  taskId?: string;
  oldStatus?: string;
  newStatus?: string;
  updatedBy?: string;
  data: {
    statusId: number;
    countAsSolved: boolean;
    [key: string]: unknown;
  };
}

// Ticket list update event (for user's ticket list view)
export interface TicketListUpdateEvent {
  eventId: string;
  updateType: string;
  requestId: string;
  data: {
    updatedFields?: string[];
    [key: string]: unknown;
  };
}

// Remote access events
export interface RemoteAccessEvent {
  sessionId: string;
  eventType: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'control_enabled' | 'control_disabled' | 'uac_detected' | 'uac_dismissed';
  data: Record<string, unknown>;
}

// Notification event
export interface NotificationEvent {
  id: string;
  type: 'new_message' | 'new_request' | 'status_change' | 'assignment';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
}
