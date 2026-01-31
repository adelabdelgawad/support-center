import { useAsyncData } from '@/lib/hooks/use-async-data';
import { getSubTasksByRequest, getSubTaskStats } from '@/lib/api/sub-tasks';
import type { SubTask } from '@/lib/api/sub-tasks';
import type { SubTaskStats } from '@/types/requests-list';
import { useCallback, useMemo } from 'react';

interface UseSubTasksOptions {
  enabled?: boolean;
  skip?: number;
  limit?: number;
}

/**
 * Hook for fetching sub-tasks and their stats using useAsyncData
 * Provides automatic request deduplication and uses initial SSR data
 *
 * @param requestId - The parent request ID
 * @param initialData - Initial data from SSR (optional)
 * @param options - Options for fetching (enabled, skip, limit)
 * @returns Sub-tasks data, stats, loading states, and refetch function
 */
export function useSubTasks(
  requestId: string | null,
  initialData?: {
    items: any[];
    total: number;
    stats?: any;
  },
  options: UseSubTasksOptions = {}
) {
  const { enabled = true, skip = 0, limit = 20 } = options;

  // Memoize fetch params for tasks
  const tasksFetchParams = useMemo(() => ({
    enabled,
    requestId,
    skip,
    limit,
  }), [enabled, requestId, skip, limit]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!enabled || !requestId) {
      return { items: [], total: 0 };
    }
    return await getSubTasksByRequest(requestId, skip, limit);
  }, [enabled, requestId, skip, limit]);

  const {
    data: tasksData,
    error: tasksError,
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useAsyncData(
    fetchTasks,
    [tasksFetchParams],
    initialData ? { items: initialData.items as SubTask[], total: initialData.total } : undefined
  );

  // Fetch stats
  const statsFetchParams = useMemo(() => ({
    enabled,
    requestId,
  }), [enabled, requestId]);

  const fetchStats = useCallback(async () => {
    if (!enabled || !requestId) {
      return {
        total: 0,
        byStatus: {},
        blockedCount: 0,
        overdueCount: 0,
        completedCount: 0,
      } as SubTaskStats;
    }
    return await getSubTaskStats(requestId);
  }, [enabled, requestId]);

  const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useAsyncData(
    fetchStats,
    [statsFetchParams],
    initialData?.stats as SubTaskStats | undefined
  );

  // Combined refetch function to refresh both tasks and stats
  const mutate = useCallback(async () => {
    await Promise.all([
      refetchTasks(),
      refetchStats(),
    ]);
  }, [refetchTasks, refetchStats]);

  return {
    tasks: tasksData?.items ?? [],
    total: tasksData?.total ?? 0,
    stats: stats ?? {
      total: 0,
      byStatus: {},
      blockedCount: 0,
      overdueCount: 0,
      completedCount: 0,
    },
    isLoading: tasksLoading || statsLoading,
    error: tasksError || statsError,
    mutate,
  };
}
