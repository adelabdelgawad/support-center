"use client";

import {
  DynamicTableBar,
  SearchInput,
  ExportButton,
  PrintButton,
} from "@/components/data-table";
import type { Table } from "@tanstack/react-table";

interface RequestStatusesTableHeaderProps {
  page: number;
  tableInstance: Table<any> | null;
}

/**
 * Header section of the request statuses table with search and export controls
 */
export function RequestStatusesTableHeader({ page, tableInstance }: RequestStatusesTableHeaderProps) {
  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="header"
        left={
          <SearchInput
            placeholder="Search statuses..."
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
                  filename="request-statuses"
                  page={page}
                />
                <PrintButton
                  table={tableInstance}
                  title="Request Statuses"
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
