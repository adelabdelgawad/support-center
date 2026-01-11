"use server";

import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";
import type {
  SessionWithUser,
  ActiveSession,
  ActiveSessionStats,
  ActiveSessionsPageData,
  SessionStatus,
  SessionTypeName,
  VersionStatusMetrics,
} from "@/types/sessions";

// Session status thresholds (must align with backend cleanup: 2 min timeout)
const STALE_THRESHOLD_MS = 1 * 60 * 1000; // 1 minute - warning state
const DISCONNECTED_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes - matches backend cleanup

/**
 * Derive session status from last heartbeat timestamp
 */
function deriveSessionStatus(lastHeartbeat: string, isActive: boolean): SessionStatus {
  if (!isActive) {
    return 'disconnected';
  }

  const now = new Date().getTime();
  const heartbeatTime = new Date(lastHeartbeat).getTime();
  const timeSinceHeartbeat = now - heartbeatTime;

  if (timeSinceHeartbeat <= STALE_THRESHOLD_MS) {
    return 'active';
  } else if (timeSinceHeartbeat <= DISCONNECTED_THRESHOLD_MS) {
    return 'stale';
  } else {
    return 'disconnected';
  }
}

/**
 * Map session_type_id to display name
 */
function getSessionTypeName(sessionTypeId: number): SessionTypeName {
  switch (sessionTypeId) {
    case 1: return 'web';
    case 2: return 'desktop';
    case 3: return 'mobile';
    default: return 'web';
  }
}

/**
 * Calculate session duration in minutes
 * Uses a snapshot time to ensure consistency between server and client
 */
function calculateDuration(createdAt: string, snapshotTime: number): number {
  const created = new Date(createdAt).getTime();
  return Math.floor((snapshotTime - created) / (60 * 1000));
}

/**
 * Enrich sessions with derived fields
 * Runs on server with consistent timestamp to prevent hydration mismatches
 */
function enrichSessions(sessions: SessionWithUser[], snapshotTime: number): ActiveSession[] {
  return sessions.map(session => ({
    ...session,
    sessionType: getSessionTypeName(session.sessionTypeId),
    status: deriveSessionStatus(session.lastHeartbeat, session.isActive),
    durationMinutes: calculateDuration(session.createdAt, snapshotTime),
  }));
}

/**
 * Get all active DESKTOP sessions with user information
 * Primary data source for Active Sessions page
 *
 * Cache: NO_CACHE (real-time session data, must always be fresh)
 */
export async function getActiveSessionsWithUsers(): Promise<ActiveSession[]> {
  try {
    const sessions = await serverFetch<SessionWithUser[]>(
      '/sessions/desktop/active-with-users',
      CACHE_PRESETS.NO_CACHE()
    );

    // Enrich sessions with derived fields using consistent server timestamp
    const snapshotTime = Date.now();
    const enrichedSessions = enrichSessions(sessions, snapshotTime);

    return enrichedSessions;
  } catch (error: unknown) {
    console.error("Failed to fetch active desktop sessions:", error);
    return [];
  }
}

/**
 * Get desktop session statistics
 *
 * Cache: NO_CACHE (real-time stats, must always be fresh)
 */
export async function getActiveSessionStats(): Promise<ActiveSessionStats> {
  try {
    const stats = await serverFetch<ActiveSessionStats>(
      '/sessions/desktop/stats',
      CACHE_PRESETS.NO_CACHE()
    );
    return stats;
  } catch (error: unknown) {
    console.error("Failed to fetch session stats:", error);
    return {
      totalSessions: 0,
      desktopSessions: 0,
      webSessions: 0,
      mobileSessions: 0,
      activeSessions: 0,
      uniqueUsers: 0,
      avgSessionDuration: null,
    };
  }
}

/**
 * Get sessions and stats in parallel with filtering and pagination
 * Used by page.tsx for initial server-side data loading
 *
 * Cache: NO_CACHE (combines real-time data sources)
 */
interface SessionCounts {
  total: number;
  active: number;
  inactive: number;
}

export async function getActiveSessionsPageData(filters?: {
  isActive?: string;
  versionStatus?: string;
  filter?: string;
  page?: number;
  limit?: number;
}): Promise<ActiveSessionsPageData & { total: number; versionMetrics: VersionStatusMetrics; sessionCounts: SessionCounts }> {
  const { isActive, versionStatus, filter, page = 1, limit = 10 } = filters || {};

  const [allSessions, stats] = await Promise.all([
    getActiveSessionsWithUsers(),
    getActiveSessionStats(),
  ]);

  // Apply search filter first (base filtering)
  // Matches: username, fullName, ipAddress, computerName
  let baseFilteredSessions = allSessions;
  if (filter && filter.trim()) {
    const query = filter.toLowerCase();
    baseFilteredSessions = baseFilteredSessions.filter(s =>
      s.user.username.toLowerCase().includes(query) ||
      s.user.fullName?.toLowerCase().includes(query) ||
      s.ipAddress.toLowerCase().includes(query) ||
      s.computerName?.toLowerCase().includes(query)
    );
  }

  // Calculate session status counts BEFORE is_active filter
  const sessionCounts: SessionCounts = {
    total: baseFilteredSessions.length,
    active: baseFilteredSessions.filter(s => s.isActive).length,
    inactive: baseFilteredSessions.filter(s => !s.isActive).length,
  };

  // Apply is_active filter
  let filteredSessions = baseFilteredSessions;
  if (isActive && isActive !== "all") {
    const isActiveValue = isActive === "true";
    filteredSessions = filteredSessions.filter(s => s.isActive === isActiveValue);
  }

  // Calculate version metrics BEFORE version status filter
  const versionMetrics: VersionStatusMetrics = {
    total: filteredSessions.length,
    ok: filteredSessions.filter(s => s.versionStatus === 'ok').length,
    outdated: filteredSessions.filter(s => s.versionStatus === 'outdated').length,
    outdatedEnforced: filteredSessions.filter(s => s.versionStatus === 'outdated_enforced').length,
    unknown: filteredSessions.filter(s => s.versionStatus === 'unknown' || !s.versionStatus).length,
  };

  // Apply version_status filter (after calculating metrics)
  if (versionStatus && versionStatus !== "all") {
    filteredSessions = filteredSessions.filter(s => {
      const status = s.versionStatus || 'unknown';
      return status === versionStatus;
    });
  }

  const total = filteredSessions.length;

  // Apply pagination
  const skip = (page - 1) * limit;
  const paginatedSessions = filteredSessions.slice(skip, skip + limit);

  return { sessions: paginatedSessions, stats, versionMetrics, sessionCounts, total };
}

/**
 * Trigger heartbeat for a specific session
 * Used for manual session refresh/revalidation
 */
export async function sendSessionHeartbeat(sessionId: number): Promise<boolean> {
  try {
    await serverFetch(
      `/sessions/${sessionId}/heartbeat`,
      { method: 'POST' }
    );
    return true;
  } catch (error: unknown) {
    console.error(`Failed to send heartbeat for session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Revalidate all sessions by triggering heartbeats
 * Used for manual "Refresh All" action
 */
export async function revalidateAllSessions(sessionIds: number[]): Promise<{
  success: number;
  failed: number;
}> {
  const results = await Promise.allSettled(
    sessionIds.map(id => sendSessionHeartbeat(id))
  );

  const success = results.filter(r => r.status === 'fulfilled' && r.value).length;
  const failed = results.length - success;

  return { success, failed };
}
