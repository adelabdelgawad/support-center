"use client";

import { createContext, useContext, ReactNode } from "react";
import type { TicketListItem } from "@/lib/types/api/requests";

interface TicketsActionsContextType {
  updateTickets: (tickets: TicketListItem[]) => Promise<void>;
  onRefresh: () => void;
}

const TicketsActionsContext = createContext<TicketsActionsContextType | null>(null);

interface TicketsActionsProviderProps {
  children: ReactNode;
  actions: TicketsActionsContextType;
}

export function TicketsActionsProvider({
  children,
  actions,
}: TicketsActionsProviderProps) {
  return (
    <TicketsActionsContext.Provider value={actions}>
      {children}
    </TicketsActionsContext.Provider>
  );
}

export function useTicketsActions() {
  const context = useContext(TicketsActionsContext);
  if (!context) {
    throw new Error("useTicketsActions must be used within TicketsActionsProvider");
  }
  return context;
}
