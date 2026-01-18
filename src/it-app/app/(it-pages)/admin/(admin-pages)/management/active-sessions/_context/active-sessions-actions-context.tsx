"use client";

import { createContext, useContext, ReactNode } from "react";
import type { ActiveSession } from "@/types/sessions";

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface ActiveSessionsActionsContextType {
  onRemoteAccess: (session: ActiveSession) => Promise<ActionResult>;
  onUpdateClient: (session: ActiveSession) => Promise<ActionResult>;
  onRefreshSessions: () => Promise<ActionResult>;
  refetch: () => void;
}

const ActiveSessionsActionsContext = createContext<ActiveSessionsActionsContextType | null>(null);

interface ActiveSessionsActionsProviderProps {
  children: ReactNode;
  actions: ActiveSessionsActionsContextType;
}

export function ActiveSessionsActionsProvider({
  children,
  actions,
}: ActiveSessionsActionsProviderProps) {
  return (
    <ActiveSessionsActionsContext.Provider value={actions}>
      {children}
    </ActiveSessionsActionsContext.Provider>
  );
}

export function useActiveSessionsActions() {
  const context = useContext(ActiveSessionsActionsContext);
  if (!context) {
    throw new Error("useActiveSessionsActions must be used within ActiveSessionsActionsProvider");
  }
  return context;
}
