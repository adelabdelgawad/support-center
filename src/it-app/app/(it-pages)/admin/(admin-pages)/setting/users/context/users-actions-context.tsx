"use client";

import { createContext, useContext, ReactNode } from "react";
import type { UserWithRolesResponse } from "@/types/users.d";

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: UserWithRolesResponse | UserWithRolesResponse[] | null;
}

interface UsersCounts {
  total: number;
  activeCount: number;
  inactiveCount: number;
  technicianCount: number;
  userCount: number;
}

interface UsersActionsContextType {
  onToggleUserStatus: (userId: number, isActive: boolean) => Promise<ActionResult>;
  onToggleTechnicianStatus: (userId: number, isTechnician: boolean) => Promise<ActionResult>;
  onUpdateUser: (userId: number, updatedUser: {
    fullName?: string | null;
    title?: string | null;
    roleIds: string[];
  }) => Promise<ActionResult>;
  updateUsers: (updatedUsers: UserWithRolesResponse[]) => Promise<void>;
  addUser: (newUser: UserWithRolesResponse) => Promise<void>;
  onBulkUpdateStatus: (userIds: number[], isActive: boolean) => Promise<ActionResult>;
  onBulkUpdateTechnician: (userIds: number[], isTechnician: boolean) => Promise<ActionResult>;
  onRefreshUsers: () => Promise<ActionResult>;
  refetch: () => void;
  counts: UsersCounts;
}

const UsersActionsContext = createContext<UsersActionsContextType | null>(null);

interface UsersActionsProviderProps {
  children: ReactNode;
  actions: UsersActionsContextType;
}

export function UsersActionsProvider({
  children,
  actions,
}: UsersActionsProviderProps) {
  return (
    <UsersActionsContext.Provider value={actions}>
      {children}
    </UsersActionsContext.Provider>
  );
}

export function useUsersTableActions() {
  const context = useContext(UsersActionsContext);
  if (!context) {
    throw new Error("useUsersTableActions must be used within UsersActionsProvider");
  }
  return context;
}
