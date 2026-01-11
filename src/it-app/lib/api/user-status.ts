'use client';

/**
 * Client-side API for user status
 * Fetches online/offline status and IP address from user sessions
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';

export interface UserConnection {
  ipAddress: string;
  userAgent: string;
  lastHeartbeat: string | null;
}

export interface UserSessionStatus {
  userId: string;
  isOnline: boolean;
  connections?: UserConnection[];
  ipAddress?: string;
  lastActivity?: string;
}

/**
 * Fetches the current session status for a user
 * Returns online/offline status and IP address if online
 */
export async function getUserStatus(userId: string): Promise<UserSessionStatus> {
  try {
    const response = await fetch(`/api/users/${userId}/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user status: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch user status for ${userId}:`, error);
    // Return offline state on error
    return {
      userId,
      isOnline: false,
    };
  }
}
