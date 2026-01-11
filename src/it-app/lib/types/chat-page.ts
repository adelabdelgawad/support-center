/**
 * TypeScript types for Chat Page data
 *
 * These types match the backend schema (HTTPSchemaModel automatically converts to camelCase)
 */

/**
 * Request status with count and color
 */
export interface RequestStatusCount {
  id: number;
  name: string;
  count: number;
  color?: string;
}

/**
 * Chat message count record by read/unread status
 */
export interface ChatMessageCountRecord {
  id: number;
  name: "read" | "unread";
  count: number;
}

export interface RequestStatus {
    id: number;
  name: string;
}

/**
 * Chat message list item with request details
 */
export interface ChatMessageListItem {
  id: string;
  title: string;
  status: string;
  statusColor?: string;
  technicianName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

/**
 * Complete chat page response
 */
export interface ChatPageResponse {
  requestStatus: RequestStatusCount[];
  chatMessagesCount: ChatMessageCountRecord[];
  chatMessages: ChatMessageListItem[];
  statuses: RequestStatus[];
}

/**
 * Query parameters for chat page data endpoint
 */
export interface ChatPageQueryParams {
  statusFilter?: number;
  readFilter?: "read" | "unread";
}
