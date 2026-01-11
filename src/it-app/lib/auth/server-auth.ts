// lib/auth/server-auth.ts - Server-side Auth Utilities
"use server";

import { cookies } from 'next/headers';
import { AppUser } from '@/types/auth';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  ACCESS_EXPIRES: 'access_token_expires',
  REFRESH_EXPIRES: 'refresh_token_expires',
  USER_DATA: 'user_data',
} as const;

/**
 * Get current user from cookies (server-side)
 * Note: This reads from httpOnly cookies set by middleware
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const cookieStore = await cookies();
    const userDataCookie = cookieStore.get(STORAGE_KEYS.USER_DATA);

    if (!userDataCookie || !userDataCookie.value) {
      return null;
    }

    const userData = JSON.parse(userDataCookie.value);
    return userData as AppUser;
  } catch (_error) {
    return null;
  }
}

/**
 * Get access token from cookies (server-side)
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(STORAGE_KEYS.ACCESS_TOKEN);

    return tokenCookie?.value || null;
  } catch (_error) {
    return null;
  }
}

/**
 * Check if user is authenticated (server-side)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(STORAGE_KEYS.ACCESS_TOKEN);
    const expiresCookie = cookieStore.get(STORAGE_KEYS.ACCESS_EXPIRES);

    if (!tokenCookie || !expiresCookie) {
      return false;
    }

    const expiresAt = parseInt(expiresCookie.value, 10);
    const now = Date.now();

    // Check if token is expired (with 1 minute buffer)
    return expiresAt > now + 60 * 1000;
  } catch (_error) {
    return false;
  }
}

/**
 * Get auth session (mimics NextAuth pattern for backward compatibility)
 * Returns an object with accessToken and user _data
 */
export async function auth(): Promise<{ accessToken: string; user: AppUser } | null> {
  try {
    const accessToken = await getAccessToken();
    const user = await getCurrentUser();

    if (!accessToken || !user) {
      return null;
    }

    return { accessToken, user };
  } catch (_error) {
    return null;
  }
}
