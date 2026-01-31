import useSWR from 'swr';
import { getSubTasksByRequest, getSubTaskStats } from '@/lib/api/sub-tasks';
import type { SubTask } from '@/lib/api/sub-tasks';
import type { SubTaskStats } from '@/types/requests-list';

interface UseSubTasksOptions {
  enabled?: boolean;
  skip?: number;
  limit?: number;
}

/**
 * SWR hook for fetching sub-tasks and their stats
 * Provides automatic request deduplication and uses initial SSR data
 *
 * @param requestId - The parent request ID
 * @param initialData - Initial data from SSR (optional)
 * @param options - Options for fetching (enabled, skip, limit)
 * @returns Sub-tasks data, stats, loading states, and mutate function
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

  // Fetch tasks
  const {
    data: tasks,
    error: tasksError,
    isLoading: tasksLoading,
    mutate: mutateTasks,
  } = useSWR(
    enabled && requestId ? ['sub-tasks', requestId, skip, limit] : null,
    () => getSubTasksByRequest(requestId!, skip, limit),
    {
      dedupingInterval: 30000, // Dedupe requests within 30s
      fallbackData: initialData
        ? { items: initialData.items as SubTask[], total: initialData.total }
        : undefined,
      revalidateOnMount: !initialData?.items?.length, // Don't refetch if we have initial data
      revalidateOnFocus: false,
    }
  );

  // Fetch stats
  const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
    mutate: mutateStats,
  } = useSWR(
    enabled && requestId ? ['sub-task-stats', requestId] : null,
    () => getSubTaskStats(requestId!),
    {
      dedupingInterval: 30000,
      fallbackData: initialData?.stats as SubTaskStats | undefined,
      revalidateOnMount: !initialData?.stats,
      revalidateOnFocus: false,
    }
  );

  // Combined mutate function to refresh both tasks and stats
  const mutate = async () => {
    await Promise.all([mutateTasks(), mutateStats()]);
  };

  return {
    tasks: tasks?.items ?? [],
    total: tasks?.total ?? 0,
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
