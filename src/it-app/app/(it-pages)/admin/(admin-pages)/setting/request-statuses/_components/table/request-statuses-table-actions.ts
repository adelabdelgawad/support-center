import { toastSuccess, toastError } from "@/lib/toast";
import type { RequestStatusResponse } from "@/types/request-statuses";
import { useRequestStatusesActions } from "../../context/request-statuses-actions-context";

interface UseRequestStatusesTableActionsProps {
  statuses: RequestStatusResponse[];
  updateStatuses: (updatedStatuses: RequestStatusResponse[]) => void;
  refetch: () => void;
  markUpdating: (ids: number[]) => void;
  clearUpdating: (ids?: number[]) => void;
}

/**
 * Hook for handling bulk actions on request statuses table
 */
export function useRequestStatusesTableActions({
  statuses,
  updateStatuses,
  refetch,
  markUpdating,
  clearUpdating,
}: UseRequestStatusesTableActionsProps) {
  const { handleToggleStatus: toggleStatus } = useRequestStatusesActions();

  const handleDisable = async (ids: number[]) => {
    markUpdating(ids);
    // Filter out readonly statuses
    const statusesToUpdate = statuses.filter((s) => ids.includes(s.id) && s.isActive && !s.readonly);

    if (statusesToUpdate.length === 0) {
      toastError("Cannot deactivate read-only statuses");
      clearUpdating(ids);
      return;
    }

    try {
      // Update each status
      for (const status of statusesToUpdate) {
        await toggleStatus(status.id.toString());
      }

      toastSuccess(`Successfully deactivated ${statusesToUpdate.length} status(es)`);
      refetch();
    } catch (error) {
      toastError("Failed to deactivate statuses");
    } finally {
      clearUpdating(ids);
    }
  };

  const handleEnable = async (ids: number[]) => {
    markUpdating(ids);
    // Filter out readonly statuses
    const statusesToUpdate = statuses.filter((s) => ids.includes(s.id) && !s.isActive && !s.readonly);

    if (statusesToUpdate.length === 0) {
      toastError("Cannot activate read-only statuses");
      clearUpdating(ids);
      return;
    }

    try {
      // Update each status
      for (const status of statusesToUpdate) {
        await toggleStatus(status.id.toString());
      }

      toastSuccess(`Successfully activated ${statusesToUpdate.length} status(es)`);
      refetch();
    } catch (error) {
      toastError("Failed to activate statuses");
    } finally {
      clearUpdating(ids);
    }
  };

  return {
    handleDisable,
    handleEnable,
  };
}
