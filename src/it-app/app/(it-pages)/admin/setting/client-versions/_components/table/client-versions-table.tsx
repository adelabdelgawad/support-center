"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import type { ClientVersion, ClientVersionListResponse } from "@/types/client-versions";
import { getClientVersions } from "@/lib/api/client-versions";
import ClientVersionsTableBody from "./client-versions-table-body";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ClientVersionsActionsProvider } from "../../context/client-versions-actions-context";
import { toastSuccess, toastError } from "@/lib/toast";

interface Session {
  accessToken: string;
  user: any;
}

interface ClientVersionsTableProps {
  session: Session;
  initialData: ClientVersionListResponse | null;
  page: number;
  limit: number;
}

/**
 * Fetcher function for manual data fetching
 */
const fetcher = async (options?: { activeOnly?: boolean }): Promise<ClientVersionListResponse> => {
  return getClientVersions(options);
};

function ClientVersionsTable({
  session,
  initialData,
  page,
  limit,
}: ClientVersionsTableProps) {
  // Initialize state with server-side data
  const [data, setData] = useState<ClientVersionListResponse | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if this is the initial mount to avoid unnecessary fetch
  const isInitialMount = useRef(true);
  // Track the previous initialData to detect SSR navigation
  const prevInitialDataRef = useRef(initialData);

  /**
   * Manual refresh function - fetches data from API
   */
  const refresh = useCallback(async () => {
    setIsValidating(true);
    try {
      const response = await fetcher({ activeOnly: false });
      setData(response);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsValidating(false);
    }
  }, []);

  /**
   * Handle SSR data changes (URL navigation)
   * When initialData changes, update state directly without refetching
   */
  useEffect(() => {
    if (initialData && initialData !== prevInitialDataRef.current) {
      setData(initialData);
      prevInitialDataRef.current = initialData;
    }
  }, [initialData]);

  /**
   * Handle URL parameter changes (filters, pagination)
   * For client-versions, we don't have filters in URL, but we keep the pattern
   */
  useEffect(() => {
    // Skip the first render - we already have data from SSR
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
  }, [page, limit]);

  const versions = data?.versions ?? [];

  // Counts from backend
  const totalCount = data?.total ?? initialData?.total ?? 0;
  const latestCount = data?.latestCount ?? initialData?.latestCount ?? 0;
  const enforcedCount = data?.enforcedCount ?? initialData?.enforcedCount ?? 0;

  /**
   * Update versions in state - updates specific versions and refreshes to get accurate counts
   */
  const updateVersions = useCallback(
    async (updatedVersions: ClientVersion[]) => {
      const currentData = data;
      if (!currentData) {
        return;
      }

      const updatedMap = new Map(updatedVersions.map((v) => [v.id, v]));

      // Update versions with fresh data from API response
      const updatedVersionsList = currentData.versions.map((version) =>
        updatedMap.has(version.id) ? updatedMap.get(version.id)! : version
      );

      // Update state immediately with new version data
      setData({
        ...currentData,
        versions: updatedVersionsList,
      });

      // Then refresh to get accurate counts from backend
      await refresh();
    },
    [data, refresh]
  );

  /**
   * Add new version to state
   */
  const addVersion = useCallback(
    async (newVersion: ClientVersion) => {
      const currentData = data;
      if (!currentData) return;

      // New version is always latest, so unset previous latest
      const updatedVersions = currentData.versions.map((v) =>
        v.isLatest && v.platform === newVersion.platform
          ? { ...v, isLatest: false }
          : v
      );

      // Add version to list
      setData({
        ...currentData,
        versions: [newVersion, ...updatedVersions],
        total: currentData.total + 1,
        latestCount: currentData.latestCount + 1,
      });

      // Refresh to get accurate counts from backend
      await refresh();
    },
    [data, refresh]
  );

  /**
   * Force refetch - alias for refresh
   */
  const refetch = refresh;

  // Error state with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-destructive mb-2">Failed to load versions</div>
          <div className="text-muted-foreground text-sm mb-4">{error.message}</div>
          <button onClick={refresh} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Define actions for the context provider
  const actions = {
    onSetLatest: async (versionId: number) => {
      try {
        const { setVersionAsLatest } = await import("@/lib/api/client-versions");
        const updatedVersion = await setVersionAsLatest(versionId);
        await updateVersions([updatedVersion]);
        toastSuccess("Version set as latest successfully");
        return { success: true, data: updatedVersion };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to set as latest";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    onToggleEnforcement: async (versionId: number, isEnforced: boolean) => {
      try {
        const { toggleVersionEnforcement } = await import("@/lib/api/client-versions");
        const updatedVersion = await toggleVersionEnforcement(versionId, isEnforced);
        await updateVersions([updatedVersion]);
        toastSuccess(`Version enforcement ${isEnforced ? "enabled" : "disabled"} successfully`);
        return { success: true, data: updatedVersion };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to toggle enforcement";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    onUpdateVersion: async (versionId: number, updatedVersion: any) => {
      try {
        const { updateClientVersion } = await import("@/lib/api/client-versions");
        const data = await updateClientVersion(versionId, updatedVersion);
        await updateVersions([data]);
        toastSuccess("Version updated successfully");
        return { success: true, data };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update version";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    updateVersions,
    addVersion,
    onDeleteVersion: async (versionId: number) => {
      try {
        const { deleteClientVersion } = await import("@/lib/api/client-versions");
        await deleteClientVersion(versionId, false);
        await refresh();
        toastSuccess("Version deleted successfully");
        return { success: true };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to delete version";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    onRefreshVersions: async () => {
      await refresh();
      return { success: true };
    },
    refetch,
    counts: {
      total: totalCount,
      latestCount,
      enforcedCount,
    },
  };

  return (
    <ClientVersionsActionsProvider actions={actions}>
      <div className="relative h-full bg-background min-h-0">
        {/* Loading Overlay */}
        {isLoading && <div className="absolute inset-0 bg-background/80 z-10 flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>}

        {/* Main Content */}
        <ErrorBoundary>
          <div className="flex-1 h-full flex flex-col min-h-0 min-w-0 p-4 space-y-2">
            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col w-full">
              <ClientVersionsTableBody
                versions={versions}
                page={page}
                limit={limit}
                refetch={refetch}
                updateVersions={updateVersions}
                addVersion={addVersion}
                isValidating={isValidating}
                totalCount={totalCount}
              />
            </div>
          </div>
        </ErrorBoundary>
      </div>
    </ClientVersionsActionsProvider>
  );
}

export default ClientVersionsTable;
