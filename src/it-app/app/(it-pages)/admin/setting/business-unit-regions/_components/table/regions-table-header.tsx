"use client";

import {
  DynamicTableBar,
  SearchInput,
  ExportButton,
  PrintButton,
} from "@/components/data-table";
import type { Table } from "@tanstack/react-table";

interface RegionsTableHeaderProps {
  page: number;
  tableInstance: Table<any> | null;
}

/**
 * Header section of the regions table with search and export controls
 */
export function RegionsTableHeader({ page, tableInstance }: RegionsTableHeaderProps) {
  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="header"
        left={
          <SearchInput
            placeholder="Search regions..."
            urlParam="name"
            debounceMs={500}
          />
        }
        right={
          <>
            {tableInstance && (
              <>
                <ExportButton
                  table={tableInstance}
                  filename="business-unit-regions"
                  page={page}
                />
                <PrintButton
                  table={tableInstance}
                  title="Business Unit Regions"
                  page={page}
                />
              </>
            )}
          </>
        }
      />
    </div>
  );
}
