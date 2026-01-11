'use client';

/**
 * Client-side API functions for user profile
 * Calls internal Next.js API routes (not backend directly)
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';

export interface PersonalInfoResponse {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  jobTitle?: string;
  department?: string;
  manager?: string;
  bio?: string;
  location?: string;
  groups: string[];
  employeeId: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Fetch user personal information
 * Calls Next.js API route which proxies to backend
 */
export async function fetchUserInformation(): Promise<PersonalInfoResponse> {
  try {
    return await apiClient.get<PersonalInfoResponse>('/api/profile');
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Export all profile-related API functions
 */
export const profileApi = {
  fetchUserInformation,
};
