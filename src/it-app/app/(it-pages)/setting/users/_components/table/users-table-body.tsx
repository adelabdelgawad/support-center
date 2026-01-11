"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { UserWithRolesResponse } from "@/types/users";
import { createUsersTableColumns } from "./users-table-columns";
import { AddUserButton } from "../actions/add-user-button";
import { useUsersTableActions } from "./users-table-actions";
import { UserActions } from "../actions/actions-menu";

interface UsersTableBodyProps {
  users: UserWithRolesResponse[];
  page: number;
  refetch: () => void;
  updateUsers: (updatedUsers: UserWithRolesResponse[]) => Promise<void>;
  addUser: (newUser: UserWithRolesResponse) => Promise<void>;
  isValidating?: boolean;
  activeCount: number;
  inactiveCount: number;
}

export default function UsersTableBody({
  users,
  page,
  refetch,
  updateUsers,
  addUser,
  isValidating,
  activeCount,
  inactiveCount,
}: UsersTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<UserWithRolesResponse> | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<UserWithRolesResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;

  const selectedIds = selectedUsers
    .map((user) => typeof user.id === 'string' ? parseInt(user.id, 10) : user.id)
    .filter(Boolean) as number[];

  /**
   * Mark users as being updated
   */
  const markUpdating = useCallback((ids: number[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  /**
   * Clear updating state
   */
  const clearUpdating = useCallback((ids?: number[]) => {
    if (ids && ids.length > 0) {
      const newSet = new Set(updatingIds);
      ids.forEach((id) => newSet.delete(id));
      setUpdatingIds(newSet);
    } else {
      setUpdatingIds(new Set());
    }
  }, [updatingIds]);

  /**
   * Handle clear selection after bulk operations
   */
  const handleClearSelection = useCallback(() => {
    setSelectedUsers([]);
    // Also reset the table's internal selection state
    tableInstance?.resetRowSelection();
  }, [tableInstance]);

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Get bulk action handlers
  const { handleDisable, handleEnable, handleConvertToTechnician } = useUsersTableActions({
    users,
    updateUsers,
    refetch,
    markUpdating,
    clearUpdating,
  });

  // Create columns with actions
  const columns = useMemo(
    () =>
      createUsersTableColumns({
        updatingIds,
        updateUsers,
        refetch,
        markUpdating,
        clearUpdating,
      }).map((column) => {
        // Special handling for actions column to include UserActions
        if (column.id === "actions") {
          return {
            ...column,
            cell: ({ row }: { row: { original: UserWithRolesResponse } }) => {
              const isRowUpdating = Boolean(
                row.original.id && updatingIds.has(typeof row.original.id === 'string' ? parseInt(row.original.id, 10) : row.original.id)
              );
              return (
                <div
                  className={`flex justify-center ${
                    isRowUpdating ? "opacity-60 pointer-events-none" : ""
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <UserActions
                    user={row.original}
                    onUpdate={refetch}
                    onUserUpdated={(updatedUser) => {
                      // Update the specific user in the table without full refetch
                      updateUsers([updatedUser]);
                    }}
                    disabled={isRowUpdating}
                  />
                </div>
              );
            },
          };
        }
        return column;
      }),
    [updatingIds, updateUsers, refetch, markUpdating, clearUpdating]
  );

  // Memoize sorted data
  const tableData = useMemo(() => users, [users]);

  return (
    <div className="h-full flex flex-col min-h-0 ml-2 space-y-2">
      {/* Controller Bar */}
      <SettingsTableHeader<number>
        statusFilter={{
          activeCount,
          inactiveCount,
          totalCount: activeCount + inactiveCount,
        }}
        selection={{
          selectedIds,
          onClearSelection: handleClearSelection,
          itemName: "user",
        }}
        search={{
          placeholder: "Search users...",
          urlParam: "filter",
        }}
        addButton={<AddUserButton onAdd={handleRefresh} addUser={addUser} />}
        bulkActions={{
          onDisable: handleDisable,
          onEnable: handleEnable,
          isUpdating,
        }}
        onRefresh={handleRefresh}
        tableInstance={tableInstance}
      />

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DataTable<UserWithRolesResponse>
          columns={columns}
          _data={tableData}
          tableInstanceHook={(table) => setTableInstance(table)}
          onRowSelectionChange={setSelectedUsers}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={false}
        />
      </div>
    </div>
  );
}
