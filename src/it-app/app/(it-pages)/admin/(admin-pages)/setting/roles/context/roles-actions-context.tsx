"use client";

import { createContext, useContext, ReactNode } from "react";
import type { RoleResponse } from "@/types/roles";

export interface RolesActionsContextType {
  handleToggleStatus: (roleId: string, newStatus: boolean) => void;
  handleUpdateRole: (roleId: string, updatedRole: RoleResponse) => void;
  mutate: () => void;
  updateCounts: () => void;
  markUpdating: (ids: string[]) => void;
  clearUpdating: () => void;
  updateRoles: (updatedRoles: RoleResponse[]) => void;
  addRole: (newRole: RoleResponse) => void;
}

// Note: roleId is the role's UUID (role.id field)

// Create context with undefined default
const RolesActionsContext = createContext<RolesActionsContextType | undefined>(
  undefined
);

interface RolesActionsProviderProps {
  children: ReactNode;
  actions: RolesActionsContextType;
}

/**
 * Provider component that makes roles actions available to all child components
 */
export function RolesActionsProvider({
  children,
  actions,
}: RolesActionsProviderProps) {
  return (
    <RolesActionsContext.Provider value={actions}>
      {children}
    </RolesActionsContext.Provider>
  );
}

/**
 * Custom hook to access roles actions from context
 * @throws Error if used outside of RolesActionsProvider
 */
export function useRolesActions() {
  const context = useContext(RolesActionsContext);

  if (context === undefined) {
    throw new Error(
      "useRolesActions must be used within a RolesActionsProvider"
    );
  }

  return context;
}
