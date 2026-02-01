import { toastSuccess, toastError } from "@/lib/toast";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { useRegionsActions } from "../../context/regions-actions-context";

interface UseRegionsTableActionsProps {
  regions: BusinessUnitRegionResponse[];
  updateRegions: (updatedRegions: BusinessUnitRegionResponse[]) => void;
  refetch: () => void;
  markUpdating: (ids: number[]) => void;
  clearUpdating: (ids?: number[]) => void;
}

/**
 * Hook for handling bulk actions on regions table
 */
export function useRegionsTableActions({
  regions,
  updateRegions,
  refetch,
  markUpdating,
  clearUpdating,
}: UseRegionsTableActionsProps) {
  const { handleToggleStatus: toggleStatus } = useRegionsActions();

  const handleDisable = async (ids: number[]) => {
    markUpdating(ids);
    const regionsToUpdate = regions.filter((r) => ids.includes(r.id) && r.isActive);

    try {
      // Update each region
      for (const region of regionsToUpdate) {
        await toggleStatus(region.id);
      }

      toastSuccess(`Successfully deactivated ${regionsToUpdate.length} region(s)`);
      refetch();
    } catch (error) {
      toastError("Failed to deactivate regions");
    } finally {
      clearUpdating(ids);
    }
  };

  const handleEnable = async (ids: number[]) => {
    markUpdating(ids);
    const regionsToUpdate = regions.filter((r) => ids.includes(r.id) && !r.isActive);

    try {
      // Update each region
      for (const region of regionsToUpdate) {
        await toggleStatus(region.id);
      }

      toastSuccess(`Successfully activated ${regionsToUpdate.length} region(s)`);
      refetch();
    } catch (error) {
      toastError("Failed to activate regions");
    } finally {
      clearUpdating(ids);
    }
  };

  return {
    handleDisable,
    handleEnable,
  };
}
