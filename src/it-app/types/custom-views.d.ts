/**
 * Type definitions for user custom views
 *
 * Backend design: ONE view per user controlling visible tabs
 * - Controls which predefined tabs/views are visible
 * - Sets default tab when user opens tickets page
 * - Auto-created on first GET request
 */

/**
 * Available tab IDs (predefined views in the backend)
 */
export type AvailableTabId =
  | 'unassigned'
  | 'all_unsolved'
  | 'my_unsolved'
  | 'recently_updated'
  | 'recently_solved'
  | 'all_your_requests'
  | 'urgent_high_priority'
  | 'pending_requester_response'
  | 'pending_subtask'
  | 'new_today'
  | 'in_progress';

/**
 * User's custom view configuration (ONE per user)
 */
export interface UserCustomView {
  id: number;
  userId: string; // UUID
  visibleTabs: AvailableTabId[]; // Which tabs to show
  defaultTab: AvailableTabId; // Default tab when opening page
  isActive: boolean;
  createdAt: string; // ISO datetime string
  updatedAt: string; // ISO datetime string
}

/**
 * Update user's custom view
 */
export interface UserCustomViewUpdate {
  visibleTabs?: AvailableTabId[];
  defaultTab?: AvailableTabId;
  isActive?: boolean;
}

/**
 * Available tabs response
 */
export interface AvailableTabsResponse {
  availableTabs: AvailableTabId[];
}
