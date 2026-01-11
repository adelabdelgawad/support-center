import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import type { SessionWithUser, ActiveSession, ActiveSessionStats, SessionTypeName, SessionStatus, VersionStatus, VersionStatusMetrics } from "@/types/sessions";

/**
 * GET /api/sessions/active-desktop
 *
 * Fetches active desktop sessions with filtering and pagination
 * Query params:
 * - is_active: "true" | "false" | "all"
 * - version_status: "ok" | "outdated" | "outdated_enforced" | "unknown" | "all"
 * - filter: username search
 * - page: page number (default: 1)
 * - per_page: items per page (default: 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract query parameters
    const isActive = searchParams.get("is_active") || "";
    const versionStatusFilter = searchParams.get("version_status") || "";
    const filter = searchParams.get("username") || "";
    const page = Number(searchParams.get("page")) || 1;
    const perPage = Number(searchParams.get("per_page")) || 10;


    // Fetch desktop sessions and stats in parallel
    const [sessionsData, statsData] = await Promise.all([
      makeAuthenticatedRequest<SessionWithUser[]>(
        'GET',
        '/sessions/desktop/active-with-users'
      ),
      makeAuthenticatedRequest<ActiveSessionStats>(
        'GET',
        '/sessions/stats'
      ),
    ]);


    // Server-side enrichment with consistent snapshot time
    const snapshotTime = Date.now();
    const enrichedSessions: ActiveSession[] = sessionsData.map(session => {
      const lastHeartbeatTime = new Date(session.lastHeartbeat).getTime();
      const minutesSinceHeartbeat = (snapshotTime - lastHeartbeatTime) / (1000 * 60);
      const isActiveHeartbeat = minutesSinceHeartbeat <= 5;

      const createdTime = new Date(session.createdAt).getTime();
      const durationMinutes = Math.floor((snapshotTime - createdTime) / (1000 * 60));

      return {
        ...session,
        sessionType: getSessionTypeName(session.sessionTypeId),
        status: deriveSessionStatus(session.lastHeartbeat, session.isActive),
        durationMinutes,
      };
    });

    // Apply search filter first (base filtering)
    // Matches: username, fullName, ipAddress, computerName
    let baseFilteredSessions = enrichedSessions;
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
    // These represent the total breakdown for the filter buttons
    const sessionCounts = {
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
    // This ensures metrics reflect the base filtered dataset
    const versionMetrics: VersionStatusMetrics = {
      total: filteredSessions.length,
      ok: filteredSessions.filter(s => s.versionStatus === 'ok').length,
      outdated: filteredSessions.filter(s => s.versionStatus === 'outdated').length,
      outdatedEnforced: filteredSessions.filter(s => s.versionStatus === 'outdated_enforced').length,
      unknown: filteredSessions.filter(s => s.versionStatus === 'unknown' || !s.versionStatus).length,
    };


    // Apply version_status filter (after calculating metrics)
    if (versionStatusFilter && versionStatusFilter !== "all") {
      filteredSessions = filteredSessions.filter(s => {
        const status = s.versionStatus || 'unknown';
        return status === versionStatusFilter;
      });
    }


    // Pagination
    const total = filteredSessions.length;
    const skip = (page - 1) * perPage;
    const paginatedSessions = filteredSessions.slice(skip, skip + perPage);


    return NextResponse.json({
      sessions: paginatedSessions,
      stats: statsData,
      versionMetrics,
      sessionCounts,
      total,
    });
  } catch (error) {
    console.error("Error fetching active desktop sessions:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// Helper functions (matching server action logic)
function getSessionTypeName(typeId: number): SessionTypeName {
  const typeMap: Record<number, SessionTypeName> = {
    1: 'web',
    2: 'desktop',
    3: 'mobile',
  };
  return typeMap[typeId] || 'desktop';
}

function deriveSessionStatus(
  lastHeartbeat: string,
  isActive: boolean
): SessionStatus {
  if (!isActive) return 'disconnected';

  const lastHeartbeatTime = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const minutesSinceHeartbeat = (now - lastHeartbeatTime) / (1000 * 60);

  if (minutesSinceHeartbeat > 5) return 'stale';
  return 'active';
}
