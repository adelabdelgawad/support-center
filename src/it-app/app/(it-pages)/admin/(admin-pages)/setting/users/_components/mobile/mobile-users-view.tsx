"use client";

import { UserWithRolesResponse } from "@/types/users.d";
import { MobileToolbar } from "./mobile-toolbar";
import { MobileStatusFilter } from "./mobile-status-filter";
import { MobileUserFilters } from "./mobile-user-filters";
import { MobileRoleFilter } from "./mobile-role-filter";
import { MobileUsersList } from "./mobile-users-list";
import { MobilePagination } from "./mobile-pagination";
import type { RoleResponse } from "@/types/roles";

interface MobileUsersViewProps {
  users: UserWithRolesResponse[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  // Global User Type counts (always database totals)
  technicianCount: number;
  userCount: number;
  globalTotal: number;
  // Scoped Status counts (within selected User Type)
  activeCount: number;
  inactiveCount: number;
  // Filtered total for pagination
  totalCount: number;
  // Roles and scoped role counts
  roles?: RoleResponse[];
  roleCounts?: Record<string, number>;
  refetch: () => void;
  updateUsers: (updatedUsers: UserWithRolesResponse[]) => void;
  addUser: (newUser: UserWithRolesResponse) => void;
  isValidating?: boolean;
}

/**
 * Complete mobile view for the Users table
 * Includes toolbar, filters, list, and pagination
 * Full feature parity with desktop view
 */
export function MobileUsersView({
  users,
  page,
  totalPages,
  totalItems,
  pageSize,
  technicianCount,
  userCount,
  globalTotal,
  activeCount,
  inactiveCount,
  totalCount,
  roles = [],
  roleCounts = {},
  refetch,
  updateUsers,
  addUser,
  isValidating = false,
}: MobileUsersViewProps) {
  // Calculate scoped total for status filter (sum of active + inactive within User Type)
  const scopedTotal = activeCount + inactiveCount;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar: Search, Add User, Refresh */}
      <MobileToolbar
        onRefresh={refetch}
        addUser={addUser}
        isRefreshing={isValidating}
      />

      {/* Filters Section */}
      <div className="sticky top-[57px] z-10 bg-background border-b shadow-sm">
        <div className="space-y-1 py-1">
          {/* User Type Filter: All / Technicians / Users (global counts) - PRIMARY */}
          <div className="border-b border-border/50 pb-1">
            <MobileUserFilters
              technicianCount={technicianCount}
              userCount={userCount}
              totalCount={globalTotal}
            />
          </div>

          {/* Status Filter: All / Active / Inactive (scoped to User Type) - SECONDARY */}
          <div className="border-b border-border/50 pb-1">
            <MobileStatusFilter
              activeCount={activeCount}
              inactiveCount={inactiveCount}
              totalCount={scopedTotal}
            />
          </div>

          {/* Role Filter: Small cards for each role */}
          {roles.length > 0 && (
            <MobileRoleFilter roles={roles} roleCounts={roleCounts} />
          )}
        </div>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-hidden">
        <MobileUsersList
          users={users}
          refetch={refetch}
          updateUsers={updateUsers}
        />
      </div>

      {/* Pagination */}
      <div className="sticky bottom-0 bg-background border-t shadow-lg">
        <MobilePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          isLoading={isValidating}
        />
      </div>
    </div>
  );
}
