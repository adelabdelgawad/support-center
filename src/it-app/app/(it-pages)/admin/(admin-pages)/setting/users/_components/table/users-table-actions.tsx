"use client";

import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import { updateUsersStatus, updateUsersTechnicianStatus } from "@/lib/api/users";
import type { UserWithRolesResponse } from "@/types/users.d";

interface UsersTableActionsProps {
  users: UserWithRolesResponse[];
  updateUsers: (updatedUsers: UserWithRolesResponse[]) => Promise<void>;
  refetch: () => void;
  markUpdating: (ids: number[]) => void;
  clearUpdating: (ids?: number[]) => void;
}

/**
 * Handles bulk action operations for users
 */
export function useUsersTableActions({
  users,
  updateUsers,
  refetch,
  markUpdating,
  clearUpdating,
}: UsersTableActionsProps) {
  // Handle disable users
  const handleDisable = async (ids: number[]) => {
    try {
      if (ids.length === 0) {return;}

      // Filter to only active users (ones that need to be disabled)
      const activeUsersToDisable = users.filter(
        u => u.id && ids.includes(typeof u.id === 'string' ? parseInt(u.id, 10) : u.id) && u.isActive
      );

      if (activeUsersToDisable.length === 0) {
        toastWarning("Selected users are already disabled");
        return;
      }

      const userIdsToDisable = activeUsersToDisable.map(u => typeof u.id === 'string' ? parseInt(u.id, 10) : u.id) as number[];

      // Mark users as updating (show loading spinner)
      markUpdating(userIdsToDisable);

      // Call API and get updated users
      const response = await updateUsersStatus(userIdsToDisable.map(String), false);

      // Update local state with returned data
      if (response.updatedUsers && response.updatedUsers.length > 0) {
        updateUsers(response.updatedUsers);

        // Wait for state to update before clearing loading spinner
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      toastSuccess(`Successfully disabled ${response.updatedUsers.length} user(s)`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      toastError(
        `Failed to disable users: ${
          apiError.response?.data?.detail || apiError.message || "Unknown error"
        }`
      );
    } finally {
      clearUpdating();
    }
  };

  // Handle enable users
  const handleEnable = async (ids: number[]) => {
    try {
      if (ids.length === 0) {return;}

      // Filter to only inactive users (ones that need to be enabled)
      const inactiveUsersToEnable = users.filter(
        u => u.id && ids.includes(typeof u.id === 'string' ? parseInt(u.id, 10) : u.id) && !u.isActive
      );

      if (inactiveUsersToEnable.length === 0) {
        toastWarning("Selected users are already enabled");
        return;
      }

      const userIdsToEnable = inactiveUsersToEnable.map(u => typeof u.id === 'string' ? parseInt(u.id, 10) : u.id) as number[];

      // Mark users as updating (show loading spinner)
      markUpdating(userIdsToEnable);

      // Call API and get updated users
      const response = await updateUsersStatus(userIdsToEnable.map(String), true);

      // Update local state with returned data
      if (response.updatedUsers && response.updatedUsers.length > 0) {
        updateUsers(response.updatedUsers);

        // Wait for state to update before clearing loading spinner
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      toastSuccess(`Successfully enabled ${response.updatedUsers.length} user(s)`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      toastError(
        `Failed to enable users: ${
          apiError.response?.data?.detail || apiError.message || "Unknown error"
        }`
      );
    } finally {
      clearUpdating();
    }
  };

  // Handle convert to technician
  const handleConvertToTechnician = async (ids: number[]) => {
    try {
      if (ids.length === 0) return;

      // Filter to only non-technician users
      const usersToConvert = users.filter(
        u => u.id && ids.includes(typeof u.id === 'string' ? parseInt(u.id, 10) : u.id) && !u.isTechnician
      );

      if (usersToConvert.length === 0) {
        toastWarning("Selected users are already technicians");
        return;
      }

      const userIdsToConvert = usersToConvert.map(u => typeof u.id === 'string' ? parseInt(u.id, 10) : u.id) as number[];

      // Mark users as updating
      markUpdating(userIdsToConvert);

      // Call API
      const response = await updateUsersTechnicianStatus(userIdsToConvert.map(String), true);

      // Update local state
      if (response.updatedUsers && response.updatedUsers.length > 0) {
        await updateUsers(response.updatedUsers);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      toastSuccess(`Successfully converted ${response.updatedUsers.length} user(s) to technician`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      toastError(
        `Failed to convert users: ${
          apiError.response?.data?.detail || apiError.message || "Unknown error"
        }`
      );
    } finally {
      clearUpdating();
    }
  };

  return {
    handleDisable,
    handleEnable,
    handleConvertToTechnician,
  };
}
