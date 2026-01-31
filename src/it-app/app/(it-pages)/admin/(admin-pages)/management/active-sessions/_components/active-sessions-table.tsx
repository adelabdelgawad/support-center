"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useAsyncData } from "@/lib/hooks/use-async-data";
import type { ActiveSessionsPageData, ActiveSession } from "@/types/sessions";
import { SessionsTableBody } from "./sessions-table-body";
import { VersionStatusPanel } from "./version-status-panel";
import { ActiveSessionsActionsProvider } from "../_context/active-sessions-actions-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Pagination } from "@/components/data-table/table/pagination";
import { MobileSessionsView } from "./mobile/mobile-sessions-view";

interface ActiveSessionsTableProps {
  initialData: (ActiveSessionsPageData & { total: number }) | null;
}

/**
 * Fetcher function for active sessions
 * Uses Next.js internal API routes for authentication
 */
const fetchSessions = async (apiUrl: string): Promise<ActiveSessionsPageData & { total: number }> => {
  const response = await fetch(apiUrl, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();

    // Redirect to login on 401 (authentication required)
    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    throw new Error(error.detail || "Failed to fetch active sessions");
  }

  return response.json();
};

export function ActiveSessionsTable({
  initialData,
}: ActiveSessionsTableProps) {
  const searchParams = useSearchParams();

  // Track if this is the initial mount to avoid unnecessary refetch
  const isInitialMount = useRef(true);

  // Read URL parameters
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");
  const filter = searchParams?.get("filter") || "";
  const isActiveFilter = searchParams?.get("is_active") || "";
  const versionStatusFilter = searchParams?.get("version_status") || "";

  // Build API URL with current filters - memoize to avoid unnecessary refetches
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("per_page", limit.toString());
    if (filter) params.append("username", filter);
    if (isActiveFilter) params.append("is_active", isActiveFilter);
    if (versionStatusFilter) params.append("version_status", versionStatusFilter);
    return `/api/sessions/active-desktop?${params.toString()}`;
  }, [page, limit, filter, isActiveFilter, versionStatusFilter]);

  // Use useAsyncData with API URL as dependency
  const { data, isLoading, isValidating, error, refetch } = useAsyncData<ActiveSessionsPageData & { total: number }>(
    () => fetchSessions(apiUrl),
    [apiUrl],
    initialData ?? undefined
  );

  // Use data from SWR or fall back to initialData (SSR)
  const sessionsData = data ?? initialData;
  const sessions = sessionsData?.sessions ?? [];
  const stats = sessionsData?.stats ?? initialData?.stats ?? {
    totalSessions: 0,
    desktopSessions: 0,
    webSessions: 0,
    mobileSessions: 0,
    activeSessions: 0,
  };
  const total = sessionsData?.total ?? initialData?.total ?? 0;

  // Session counts from API (calculated before is_active filter)
  const sessionCounts = sessionsData?.sessionCounts ?? initialData?.sessionCounts ?? {
    total: 0,
    active: 0,
    inactive: 0,
  };

  // Version metrics from API
  const versionMetrics = sessionsData?.versionMetrics ?? initialData?.versionMetrics ?? {
    total: 0,
    ok: 0,
    outdated: 0,
    outdatedEnforced: 0,
    unknown: 0,
  };

  // Get latest version from any outdated session (they all point to same target)
  const latestVersion = sessions.find(s => s.targetVersion)?.targetVersion ?? null;

  // Error state with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-destructive mb-2">Failed to load active sessions</div>
          <div className="text-muted-foreground text-sm mb-4">{error.message}</div>
          <button onClick={() => refetch()} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Pagination should use filtered total
  const totalItems = total;
  const safeLimit = limit || 10;
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / safeLimit) : 1;

  // Define actions for the context provider
  const actions = {
    onRemoteAccess: async (_session: ActiveSession) => {
      // Handled directly in SessionActions component
      return { success: true };
    },
    onUpdateClient: async (_session: ActiveSession) => {
      // Placeholder - not yet implemented
      return { success: false, message: "Not implemented" };
    },
    onRefreshSessions: async () => {
      await refetch();
      return { success: true };
    },
    refetch,
  };

  return (
    <ActiveSessionsActionsProvider actions={actions}>
      <div className="relative h-full bg-background min-h-0">
        {/* Desktop View (md and up) */}
        <div className="hidden md:flex h-full p-1">
          {/* Version Status Panel (Sidebar) */}
          <VersionStatusPanel versionMetrics={versionMetrics} />

          {/* Main Content */}
          <ErrorBoundary>
            <div className="flex-1 h-full flex flex-col min-h-0 min-w-0 ml-2 space-y-2">
              {/* Table */}
              <div className="flex-1 min-h-0 flex flex-col w-full">
                <SessionsTableBody
                  sessions={sessions}
                  totalCount={sessionCounts.total}
                  activeCount={sessionCounts.active}
                  inactiveCount={sessionCounts.inactive}
                  onRefresh={refetch}
                  isValidating={isValidating}
                  latestVersion={latestVersion}
                />
              </div>

              {/* Pagination */}
              <div className="shrink-0 bg-card border-t border-border">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  pageSize={safeLimit}
                  totalItems={totalItems}
                />
              </div>
            </div>
          </ErrorBoundary>
        </div>

        {/* Mobile View (below md) */}
        <div className="md:hidden h-full">
          <ErrorBoundary>
            <MobileSessionsView
              sessions={sessions}
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={safeLimit}
              sessionCounts={sessionCounts}
              versionMetrics={versionMetrics}
              refetch={refetch}
              isValidating={isValidating}
            />
          </ErrorBoundary>
        </div>
      </div>
    </ActiveSessionsActionsProvider>
  );
}
