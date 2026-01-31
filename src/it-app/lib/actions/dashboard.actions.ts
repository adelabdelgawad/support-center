/**
 * Dashboard Server Actions
 *
 * Server-side functions to fetch dashboard data
 * Uses serverFetch with SHORT_LIVED cache for dashboard stats
 */

import { serverGet } from "@/lib/fetch";

/**
 * Dashboard statistics response
 */
export interface DashboardStats {
  // Ticket counts by view
  counts: {
    unassigned: number;
    all_unsolved: number;
    my_unsolved: number;
    recently_updated: number;
    recently_solved: number;
    all_your_requests?: number;
    urgent_high_priority?: number;
    pending_requester_response?: number;
    pending_subtask?: number;
    new_today?: number;
    in_progress?: number;
  };
  // Recent requests (from TechnicianRequestListItem)
  recentRequests?: Array<{
    id: string;
    subject: string;
    status: { id: number; name: string; color?: string };
    requested: string;
    priority: { id: number; name: string };
  }>;
}

/**
 * Fetch dashboard statistics for the current user
 * Returns ticket counts and recent activity
 *
 * Cache: SHORT_LIVED (1 minute) - dashboard stats can tolerate brief staleness
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Fetch technician views to get counts
    // Using perPage=5 to get a small sample of recent requests
    const response = await serverGet<any>(
      '/requests/technician-views?view=recently_updated&page=1&per_page=5',
      { revalidate: 0 }
    );

    return {
      counts: response.counts || {},
      recentRequests: response.data?.slice(0, 5) || [],
    };
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    // Return empty stats on error
    return {
      counts: {
        unassigned: 0,
        all_unsolved: 0,
        my_unsolved: 0,
        recently_updated: 0,
        recently_solved: 0,
      },
      recentRequests: [],
    };
  }
}
