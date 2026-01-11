export interface User {
  username: string;
  role: string;
}

export type TicketStatus = 'New' | 'In Progress' | 'Waiting for Response' | 'Resolved';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';
export type ChatStatus = 'read' | 'unread';
export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Critical';
export type TicketCategory = 'Technical' | 'Billing' | 'General Inquiry' | 'Feature Request';

export interface AttachmentItem {
  id: number;
  filename: string;
  fileSize: number;
  mimeType?: string;
  isCorrupted?: boolean;
  createdAt?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  senderName: string;
  content: string;
  timestamp: Date;
  attachments?: AttachmentItem[];
  attachmentCount?: number;
}

export interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  requestStatus: RequestStatus;
  chatStatus: ChatStatus;
  priority: TicketPriority;
  category: TicketCategory;
  createdAt: Date;
  updatedAt: Date;
  assignedAgent?: string;
  messages: Message[];
  unreadCount: number;
}
