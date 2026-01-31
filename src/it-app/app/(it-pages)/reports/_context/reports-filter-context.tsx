"use client";

import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type { DateRangePreset } from "@/types/reports";

interface ReportFiltersState {
  businessUnitIds?: number[];
  technicianIds?: string[];
  priorityIds?: number[];
  statusIds?: number[];
}

interface ExportInfo {
  reportTitle: string;
  reportData: any;
}

interface ReportsFilterContextValue {
  datePreset: DateRangePreset;
  customStartDate: string | undefined;
  customEndDate: string | undefined;
  filters: ReportFiltersState;
  setDatePreset: (preset: DateRangePreset) => void;
  setCustomStartDate: (date: string | undefined) => void;
  setCustomEndDate: (date: string | undefined) => void;
  setFilters: (filters: ReportFiltersState) => void;
  handlePresetChange: (preset: DateRangePreset) => void;
  handleCustomRangeChange: (startDate: string, endDate: string) => void;
  handleFiltersChange: (filters: ReportFiltersState) => void;
  // Export registration
  exportInfo: ExportInfo | null;
  registerExport: (info: ExportInfo) => void;
  clearExport: () => void;
}

const ReportsFilterContext = createContext<ReportsFilterContextValue | null>(null);

export function ReportsFilterProvider({ children }: { children: ReactNode }) {
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last_30_days");
  const [customStartDate, setCustomStartDate] = useState<string | undefined>();
  const [customEndDate, setCustomEndDate] = useState<string | undefined>();
  const [filters, setFilters] = useState<ReportFiltersState>({});
  const [exportInfo, setExportInfo] = useState<ExportInfo | null>(null);

  const handlePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
  };

  const handleCustomRangeChange = (startDate: string, endDate: string) => {
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    setDatePreset("custom");
  };

  const handleFiltersChange = (newFilters: ReportFiltersState) => {
    setFilters(newFilters);
  };

  const value = useMemo(
    () => ({
      datePreset,
      customStartDate,
      customEndDate,
      filters,
      setDatePreset,
      setCustomStartDate,
      setCustomEndDate,
      setFilters,
      handlePresetChange,
      handleCustomRangeChange,
      handleFiltersChange,
      exportInfo,
      registerExport: setExportInfo,
      clearExport: () => setExportInfo(null),
    }),
    [datePreset, customStartDate, customEndDate, filters, exportInfo]
  );

  return (
    <ReportsFilterContext.Provider value={value}>
      {children}
    </ReportsFilterContext.Provider>
  );
}

export function useReportsFilter() {
  const context = useContext(ReportsFilterContext);
  if (!context) {
    throw new Error("useReportsFilter must be used within ReportsFilterProvider");
  }
  return context;
}
