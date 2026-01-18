import { toastSuccess, toastError } from "@/lib/toast";
import type { RequestType } from "@/types/request-types";
import { useRequestTypesActions } from "../../context/request-types-actions-context";

interface UseRequestTypesTableActionsProps {
  types: RequestType[];
  updateTypes: (updatedTypes: RequestType[]) => Promise<void>;
  refetch: () => void;
  markUpdating: (ids: number[]) => void;
  clearUpdating: (ids?: number[]) => void;
}

/**
 * Hook for handling bulk actions on request types table
 */
export function useRequestTypesTableActions({
  types,
  updateTypes,
  refetch,
  markUpdating,
  clearUpdating,
}: UseRequestTypesTableActionsProps) {
  const { handleToggleStatus: toggleStatus } = useRequestTypesActions();

  const handleDisable = async (ids: number[]) => {
    markUpdating(ids);
    // Filter types to update (active ones only)
    const typesToUpdate = types.filter((t) => ids.includes(t.id) && t.isActive);

    if (typesToUpdate.length === 0) {
      toastError("No active types selected to deactivate");
      clearUpdating(ids);
      return;
    }

    try {
      // Update each type
      for (const type of typesToUpdate) {
        await toggleStatus(type.id.toString());
      }

      toastSuccess(`Successfully deactivated ${typesToUpdate.length} type(s)`);
      refetch();
    } catch (error) {
      toastError("Failed to deactivate types");
    } finally {
      clearUpdating(ids);
    }
  };

  const handleEnable = async (ids: number[]) => {
    markUpdating(ids);
    // Filter types to update (inactive ones only)
    const typesToUpdate = types.filter((t) => ids.includes(t.id) && !t.isActive);

    if (typesToUpdate.length === 0) {
      toastError("No inactive types selected to activate");
      clearUpdating(ids);
      return;
    }

    try {
      // Update each type
      for (const type of typesToUpdate) {
        await toggleStatus(type.id.toString());
      }

      toastSuccess(`Successfully activated ${typesToUpdate.length} type(s)`);
      refetch();
    } catch (error) {
      toastError("Failed to activate types");
    } finally {
      clearUpdating(ids);
    }
  };

  return {
    handleDisable,
    handleEnable,
  };
}
