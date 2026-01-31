"use client";

import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButton } from "@/components/reports/export-button";
import { useReportsFilter } from "../_context/reports-filter-context";

export function ReportsControlsBar() {
  const {
    datePreset,
    customStartDate,
    customEndDate,
    filters,
    handlePresetChange,
    handleCustomRangeChange,
    handleFiltersChange,
    exportInfo,
  } = useReportsFilter();

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {exportInfo && (
        <ExportButton
          reportTitle={exportInfo.reportTitle}
          reportData={exportInfo.reportData}
        />
      )}
      <DateRangePicker
        preset={datePreset}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onPresetChange={handlePresetChange}
        onCustomRangeChange={handleCustomRangeChange}
      />
      <ReportFilters
        selectedBusinessUnitIds={filters.businessUnitIds}
        selectedTechnicianIds={filters.technicianIds}
        selectedPriorityIds={filters.priorityIds}
        selectedStatusIds={filters.statusIds}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  );
}
