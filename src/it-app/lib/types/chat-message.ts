/**
 * Chat Message Types - Updated to match backend UUID schema
 * CLEANED: Removed attachment support, kept only screenshots
 */

// REMOVED: AttachmentItem interface (attachments removed, kept only screenshots)

/**
 * Sender information included in chat messages
 */
export interface SenderInfo {
  id: number;
  username: string;
  fullName: string | null;
  email: string | null;
}

export type MessageStatus = 'pending' | 'sent' | 'failed';

export interface ChatMessage {
  id: string; // UUID string (changed from number)
  requestId: string; // UUID string
  senderId: string | null; // UUID string (optional)
  sender?: SenderInfo | null; // Full sender details from backend
  senderName?: string; // Legacy field for backward compatibility
  content: string;
  createdAt: string;
  updatedAt: string;
  isScreenshot: boolean;
  screenshotFileName?: string | null;

  // File attachment fields (for non-image files like PDF, DOC, etc.)
  fileName?: string | null; // Original filename
  fileSize?: number | null; // File size in bytes
  fileMimeType?: string | null; // MIME type
  fileId?: number | null; // Reference to ChatFile

  // Optimistic send support
  tempId?: string; // Client-generated ID for optimistic messages (e.g., uuid)
  status?: MessageStatus; // Message delivery status
  clientTempId?: string; // Echo from server to match optimistic messages
}

export interface ChatMessageCreate {
  request_id: string;
  content: string;
  screenshot_file_name?: string;
  client_temp_id?: string; // Client-generated ID to match optimistic messages
}

export type ChatMessageRead = ChatMessage;

export interface SendMessageData {
  requestId: string;
  content: string;
}

