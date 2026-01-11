/**
 * Custom Views API Client
 *
 * Client-side API wrapper for fetching user custom view settings
 * Calls Next.js API routes (NOT backend directly)
 */

import type { UserCustomView, AvailableTabId } from '@/types/custom-views';

/**
 * Fetch current user's custom view settings
 *
 * @returns User's custom view with visible tabs and default tab
 */
export async function fetchCustomView(): Promise<UserCustomView> {
  const response = await fetch('/api/user-custom-views', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch custom view' }));
    throw new Error(error.detail || `Failed to fetch custom view: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Alias for fetchCustomView (used by custom-view-dialog)
 */
export async function fetchMyCustomView(): Promise<UserCustomView> {
  return fetchCustomView();
}

/**
 * Update current user's custom view settings
 */
export async function updateMyCustomView(data: {
  visibleTabs: AvailableTabId[];
  defaultTab: AvailableTabId;
}): Promise<UserCustomView> {
  const response = await fetch('/api/user-custom-views/update', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update custom view' }));
    throw new Error(error.detail || `Failed to update custom view: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Reset current user's custom view to defaults
 */
export async function resetMyCustomView(): Promise<UserCustomView> {
  const response = await fetch('/api/user-custom-views/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to reset custom view' }));
    throw new Error(error.detail || `Failed to reset custom view: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch available tabs that can be shown
 */
export async function fetchAvailableTabs(): Promise<AvailableTabId[]> {
  const response = await fetch('/api/user-custom-views/available-tabs', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch available tabs' }));
    throw new Error(error.detail || `Failed to fetch available tabs: ${response.statusText}`);
  }

  return await response.json();
}
