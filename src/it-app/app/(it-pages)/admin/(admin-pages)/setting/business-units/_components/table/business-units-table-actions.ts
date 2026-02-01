import { toastSuccess, toastError } from "@/lib/toast";
import type { BusinessUnitResponse } from "@/types/business-units";
import { useBusinessUnitsActions } from "../../context/business-units-actions-context";

interface UseBusinessUnitsTableActionsProps {
  businessUnits: BusinessUnitResponse[];
  updateBusinessUnits: (updatedUnits: BusinessUnitResponse[]) => void;
  refetch: () => void;
  markUpdating: (ids: number[]) => void;
  clearUpdating: (ids?: number[]) => void;
}

/**
 * Hook for handling bulk actions on business units table
 */
export function useBusinessUnitsTableActions({
  businessUnits,
  updateBusinessUnits,
  refetch,
  markUpdating,
  clearUpdating,
}: UseBusinessUnitsTableActionsProps) {
  const { handleToggleStatus: toggleStatus } = useBusinessUnitsActions();

  const handleDisable = async (ids: number[]) => {
    markUpdating(ids);
    const unitsToUpdate = businessUnits.filter((u) => ids.includes(u.id) && u.isActive);

    try {
      // Update each business unit
      for (const unit of unitsToUpdate) {
        await toggleStatus(unit.id);
      }

      toastSuccess(`Successfully deactivated ${unitsToUpdate.length} business unit(s)`);
      refetch();
    } catch (error) {
      toastError("Failed to deactivate business units");
    } finally {
      clearUpdating(ids);
    }
  };

  const handleEnable = async (ids: number[]) => {
    markUpdating(ids);
    const unitsToUpdate = businessUnits.filter((u) => ids.includes(u.id) && !u.isActive);

    try {
      // Update each business unit
      for (const unit of unitsToUpdate) {
        await toggleStatus(unit.id);
      }

      toastSuccess(`Successfully activated ${unitsToUpdate.length} business unit(s)`);
      refetch();
    } catch (error) {
      toastError("Failed to activate business units");
    } finally {
      clearUpdating(ids);
    }
  };

  return {
    handleDisable,
    handleEnable,
  };
}
