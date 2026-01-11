/**
 * Session types for Active Sessions Management
 * Matches backend schemas from src/backend/schemas/session/session.py
 */

// User info embedded in session (matches SessionUserInfo backend schema)
export interface SessionUserInfo {
  id: string; // UUID
  username: string;
  fullName: string | null;
}

// Session with user info (matches SessionWithUserRead backend schema)
export interface SessionWithUser {
  id: string; // UUID - desktop sessions use UUID as primary key
  userId: string; // UUID
  sessionTypeId: number; // 1=web, 2=desktop, 3=mobile
  ipAddress: string;
  isActive: boolean;
  createdAt: string; // ISO datetime
  lastHeartbeat: string; // ISO datetime
  appVersion?: string | null; // Client application version (e.g., '1.0.0' for Tauri app)
  computerName?: string | null; // Computer hostname for desktop sessions
  user: SessionUserInfo;
}

// Session statistics (matches ActiveSessionStats backend schema)
export interface ActiveSessionStats {
  totalSessions: number;
  desktopSessions: number;
  webSessions: number;
  mobileSessions: number;
  activeSessions: number;
  uniqueUsers: number;
  avgSessionDuration: number | null; // minutes
}

// Derived session status (computed server-side)
export type SessionStatus = 'active' | 'stale' | 'disconnected';

// Session type names for display
export type SessionTypeName = 'web' | 'desktop' | 'mobile';

// Version policy status (computed server-side via Version Authority)
export type VersionStatus = 'ok' | 'outdated' | 'outdated_enforced' | 'unknown';

// Server-enriched session with derived fields
// Enrichment happens on server to prevent hydration mismatches
export interface ActiveSession extends SessionWithUser {
  sessionType: SessionTypeName;
  status: SessionStatus;
  durationMinutes: number; // Time since created_at (calculated with server snapshot)
  // Version policy fields (from Version Authority)
  versionStatus?: VersionStatus;
  targetVersion?: string | null;
}

// Version status metrics (computed from current dataset)
export interface VersionStatusMetrics {
  total: number;
  ok: number;
  outdated: number;
  outdatedEnforced: number;
  unknown: number;
}

// Session counts (computed before is_active filter)
export interface SessionCounts {
  total: number;
  active: number;
  inactive: number;
}

// Combined response for page data
// Sessions are pre-enriched on server with consistent timestamp
export interface ActiveSessionsPageData {
  sessions: ActiveSession[];
  stats: ActiveSessionStats;
  versionMetrics?: VersionStatusMetrics;
  sessionCounts?: SessionCounts;
}
