"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useCallback, useEffect, useRef } from "react";
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
 * Fetcher function for SWR - optimized for caching and deduping
 * Uses Next.js internal API routes for authentication
 */
const fetcher = async (url: string) => {
  const response = await fetch(url, {
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
  // Track the previous initialData to detect SSR navigation
  const prevInitialDataRef = useRef(initialData);

  // Read URL parameters
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");
  const filter = searchParams?.get("filter") || "";
  const isActiveFilter = searchParams?.get("is_active") || "";
  const versionStatusFilter = searchParams?.get("version_status") || "";

  // Build API URL with current filters - use Next.js API route
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("per_page", limit.toString());
  if (filter) params.append("username", filter);
  if (isActiveFilter) params.append("is_active", isActiveFilter);
  if (versionStatusFilter) params.append("version_status", versionStatusFilter);

  // Use Next.js internal API route for authentication
  const apiUrl = `/api/sessions/active-desktop?${params.toString()}`;

  /**
   * SWR Configuration - Manual Refetch Only
   *
   * ALL automatic client-side refetching is DISABLED:
   * - No refetch on mount
   * - No refetch on window focus
   * - No refetch on reconnect
   * - No refetch when data becomes stale
   *
   * Data ONLY refetches when:
   * - Filters change (isActiveFilter, filter)
   * - Page changes
   * - Manual refetch is called (via refresh button)
   *
   * This is handled by the useEffect below that watches filter parameters.
   */
  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.sessions && initialData.sessions.length > 0;

  const { data, mutate, isLoading, isValidating, error } = useSWR<ActiveSessionsPageData & { total: number }>(
    apiUrl,
    fetcher,
    {
      // Use server-side data as initial cache
      fallbackData: initialData ?? undefined,

      // Keep previous data for smooth transitions
      keepPreviousData: true,

      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,

      // Dedupe requests within 2 seconds
      dedupingInterval: 2000,
    }
  );

  // When initialData changes (SSR navigation), update SWR cache directly
  // This avoids a redundant CSR fetch after URL navigation
  useEffect(() => {
    // If initialData changed (due to URL navigation with SSR data)
    if (initialData && initialData !== prevInitialDataRef.current) {
      // Update SWR cache with new SSR data (no revalidation needed)
      mutate(initialData, { revalidate: false });
      prevInitialDataRef.current = initialData;
    }
  }, [initialData, mutate]);

  // Force revalidation when filters or page changes
  // This ensures data refreshes on client-side navigation (pagination, filtering)
  useEffect(() => {
    // Skip the first render - we already have data from SSR
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Trigger refetch on filter/page changes (including client-side pagination)
    mutate();
  }, [isActiveFilter, versionStatusFilter, filter, page, mutate]);

  const sessions = data?.sessions ?? [];
  const stats = data?.stats ?? initialData?.stats ?? {
    totalSessions: 0,
    desktopSessions: 0,
    webSessions: 0,
    mobileSessions: 0,
    activeSessions: 0,
  };
  const total = data?.total ?? initialData?.total ?? 0;

  // Session counts from API (calculated before is_active filter)
  const sessionCounts = data?.sessionCounts ?? initialData?.sessionCounts ?? {
    total: 0,
    active: 0,
    inactive: 0,
  };

  // Version metrics from API
  const versionMetrics = data?.versionMetrics ?? initialData?.versionMetrics ?? {
    total: 0,
    ok: 0,
    outdated: 0,
    outdatedEnforced: 0,
    unknown: 0,
  };

  // Get latest version from any outdated session (they all point to same target)
  const latestVersion = sessions.find(s => s.targetVersion)?.targetVersion ?? null;

  /**
   * Force refetch
   */
  const refetch = useCallback(() => {
    mutate();
  }, [mutate]);

  // Error state with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-destructive mb-2">Failed to load active sessions</div>
          <div className="text-muted-foreground text-sm mb-4">{error.message}</div>
          <button onClick={() => mutate()} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
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
      await mutate();
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
