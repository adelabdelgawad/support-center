/**
 * Messaging Permission Utilities
 *
 * Provides functions to check if a user can send messages to a support request
 * based on their role as assignee or requester.
 */

import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Assignee } from '@/lib/hooks/use-request-assignees';

/**
 * Permission result interface
 */
export interface PermissionResult {
  canMessage: boolean;
  reason?: string;
  isAssignee: boolean;
  isRequester: boolean;
}

/**
 * Check if a user can message a specific request
 * User must be either an assignee or the requester to send messages
 */
export function checkMessagingPermission(
  currentUserId: number | string, // Support both for backward compatibility
  ticket: ServiceRequestDetail,
  assignees: Assignee[] = []
): PermissionResult {
  // Check if user is an assignee
  const isAssignee = assignees.some(assignee => String(assignee.userId) === String(currentUserId));

  // Extract requester id safely; support both embedded requester object and flat requesterId
  const requesterId =
    ticket.requester?.id ??
    ticket.requesterId ??
    null;

  // Requester can always message their own request if we can identify them
  const isRequester = requesterId !== null && String(requesterId) === String(currentUserId);

  const canMessage = isAssignee || isRequester;

  let reason: string | undefined;
  if (!canMessage) {
    reason = "You don't have permission to reply to this request. Only assignees and the requester can send messages.";
  }

  return {
    canMessage,
    reason,
    isAssignee,
    isRequester
  };
}

/**
 * Check messaging permission for multiple users (for bulk operations)
 */
export function checkBulkMessagingPermissions(
  userIds: (number | string)[],
  ticket: ServiceRequestDetail,
  assignees: Assignee[] = []
): Map<number | string, PermissionResult> {
  const results = new Map<number | string, PermissionResult>();

  userIds.forEach(userId => {
    results.set(userId, checkMessagingPermission(userId, ticket, assignees));
  });

  return results;
}

/**
 * Validate messaging permission on the server side
 * This is more secure as it checks against the actual backend data
 * 
 * NOTE: This function should only be used in Server Components or API Routes.
 * For client-side validation, use checkMessagingPermission() instead.
 * 
 * To use this in an API route, create a dedicated endpoint like:
 * /api/requests/[id]/messaging-permission
 */
export async function validateServerMessagingPermission(
  requestId: string,
  currentUserId: number | string,
  serverUtils: {
    makeAuthenticatedRequest: <T>(
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      url: string,
      data?: unknown,
      config?: { headers?: Record<string, string>; responseType?: 'json' | 'blob' | 'arraybuffer' | 'text' | 'stream' }
    ) => Promise<T>
  }
): Promise<PermissionResult> {
  try {
    // Fetch assignees from backend
    const assigneesResponse = await serverUtils.makeAuthenticatedRequest<{ assignees: Assignee[] }>(
      'GET',
      `/requests/${requestId}/assignees`
    );
    
    // Fetch ticket details to get requester info
    const ticket = await serverUtils.makeAuthenticatedRequest<ServiceRequestDetail>(
      'GET',
      `/requests/${requestId}`
    );
    
    // Check permissions using the client-side logic
    return checkMessagingPermission(currentUserId, ticket, assigneesResponse.assignees);
  } catch (error) {
    console.error('Error validating server messaging permission:', error);
    // On error, deny permission for security
    return {
      canMessage: false,
      reason: 'Unable to verify permissions. Please try again.',
      isAssignee: false,
      isRequester: false
    };
  }
}

/**
 * Log unauthorized messaging attempt for security auditing
 */
export function logUnauthorizedMessageAttempt(
  requestId: string,
  userId: number,
  userInfo: { username: string; fullName?: string },
  reason: string
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event: 'UNAUTHORIZED_MESSAGE_ATTEMPT',
    requestId,
    userId,
    username: userInfo.username,
    fullName: userInfo.fullName,
    reason,
    severity: 'WARNING'
  };
  
  // Log to console (in production, this should go to a proper logging service)
  console.warn('🚨 Unauthorized Message Attempt:', logEntry);
  
  // In a production environment, you would send this to:
  // - Application logs
  // - Security monitoring systems
  // - Database audit table
  // - Real-time alerting systems
}

/**
 * Extract user info for logging (safely handle missing data)
 */
export function extractUserInfoForLogging(session: any): { username: string; fullName?: string } {
  if (!session || !session.user) {
    return { username: 'unknown', fullName: undefined };
  }
  
  return {
    username: session.user.username || 'unknown',
    fullName: session.user.fullName
  };
}