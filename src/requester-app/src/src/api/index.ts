/**
 * API Module Index
 *
 * Re-exports all API functions for convenient imports.
 *
 * Usage:
 * ```ts
 * import { loginWithAD, loginWithSSO, getRequests, sendMessage } from '@/api';
 * ```
 */

// Client and utilities
export { apiClient, getErrorMessage } from "./client";

// Authentication
export {
  loginWithAD,
  loginWithSSO,
  performAutoSSO,
  logout,
  validateToken,
  getCurrentUser,
  getDeviceInfo,
  isTauri,
  getSystemUsername,
  getComputerName,
  getOsInfo,
} from "./auth";

// Service Requests (Tickets)
export {
  getRequests,
  getRequestById,
  createRequest,
  updateRequest,
  getTicketPageData,
  refreshTicketList,
  getAllUserTickets,
  type GetRequestsParams,
} from "./requests";

// Chat Messages
export {
  getMessages,
  sendMessage,
  markMessagesAsRead,
  createTextMessage,
  type GetMessagesParams,
  type GetMessagesResponse,
} from "./messages";

