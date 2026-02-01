"use client";

import { createContext, useContext, ReactNode } from "react";
import type { ClientVersion } from "@/types/client-versions";

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: ClientVersion | ClientVersion[] | null;
}

interface ClientVersionsCounts {
  total: number;
  latestCount: number;
  enforcedCount: number;
}

interface ClientVersionsActionsContextType {
  onSetLatest: (versionId: number) => Promise<ActionResult>;
  onToggleEnforcement: (versionId: number, isEnforced: boolean) => Promise<ActionResult>;
  onUpdateVersion: (versionId: number, updatedVersion: ClientVersionUpdate) => Promise<ActionResult>;
  updateVersions: (updatedVersions: ClientVersion[]) => void;
  addVersion: (newVersion: ClientVersion) => void;
  onDeleteVersion: (versionId: number) => Promise<ActionResult>;
  onRefreshVersions: () => Promise<ActionResult>;
  refetch: () => void;
  counts: ClientVersionsCounts;
}

interface ClientVersionUpdate {
  isEnforced?: boolean;
  isActive?: boolean;
  releaseNotes?: string | null;
  silentInstallArgs?: string | null;
}

const ClientVersionsActionsContext = createContext<ClientVersionsActionsContextType | null>(null);

interface ClientVersionsActionsProviderProps {
  children: ReactNode;
  actions: ClientVersionsActionsContextType;
}

export function ClientVersionsActionsProvider({
  children,
  actions,
}: ClientVersionsActionsProviderProps) {
  return (
    <ClientVersionsActionsContext.Provider value={actions}>
      {children}
    </ClientVersionsActionsContext.Provider>
  );
}

export function useClientVersionsTableActions() {
  const context = useContext(ClientVersionsActionsContext);
  if (!context) {
    throw new Error("useClientVersionsTableActions must be used within ClientVersionsActionsProvider");
  }
  return context;
}
