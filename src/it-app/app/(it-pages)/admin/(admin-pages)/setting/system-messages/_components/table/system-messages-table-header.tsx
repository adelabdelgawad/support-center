"use client";

import {
  DynamicTableBar,
  SearchInput,
  ExportButton,
  PrintButton,
} from "@/components/data-table";
import type { Table } from "@tanstack/react-table";

interface SystemMessagesTableHeaderProps {
  page: number;
  tableInstance: Table<any> | null;
}

/**
 * Header section of the system messages table with search and export controls
 */
export function SystemMessagesTableHeader({ page, tableInstance }: SystemMessagesTableHeaderProps) {
  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="header"
        left={
          <SearchInput
            placeholder="Search by message type..."
            urlParam="message_type"
            debounceMs={500}
          />
        }
        right={
          <>
            {tableInstance && (
              <>
                <ExportButton
                  table={tableInstance}
                  filename="system-messages"
                  page={page}
                />
                <PrintButton
                  table={tableInstance}
                  title="System Messages"
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
