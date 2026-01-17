"use client";

import {
  DynamicTableBar,
  SearchInput,
  ExportButton,
  PrintButton,
} from "@/components/data-table";
import type { Table } from "@tanstack/react-table";

interface SystemEventsTableHeaderProps {
  page: number;
  tableInstance: Table<any> | null;
}

/**
 * Header section of the system events table with search and export controls
 */
export function SystemEventsTableHeader({ page, tableInstance }: SystemEventsTableHeaderProps) {
  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="header"
        left={
          <SearchInput
            placeholder="Search events..."
            urlParam="event_name"
            debounceMs={500}
          />
        }
        right={
          <>
            {tableInstance && (
              <>
                <ExportButton
                  table={tableInstance}
                  filename="system-events"
                  page={page}
                />
                <PrintButton
                  table={tableInstance}
                  title="System Events"
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
