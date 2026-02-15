"use client";

import { useState, useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { createTicketsTableColumns } from "./tickets-table-columns";
import { TicketsTableController } from "./tickets-table-controller";
import type { TicketListItem, BusinessUnitCount } from "@/lib/types/api/requests";
import type { Table } from "@tanstack/react-table";

interface TicketsTableBodyProps {
  tickets: TicketListItem[];
  page: number;
  perPage: number;
  total: number;
  updateTickets: (tickets: TicketListItem[]) => Promise<void>;
  onRefresh: () => void;
  isValidating?: boolean;
  viewItems: Array<{ key: string; name: string; count: number }>;
  activeViewKey: string;
  allCount: number;
  myCount: number;
  businessUnits: BusinessUnitCount[];
}

/**
 * Tickets Table Body Component
 *
 * Uses the reusable DataTable + SettingsTableHeader (same pattern as users page).
 * Handles row selection and table rendering.
 */
export function TicketsTableBody({
  tickets,
  page,
  perPage,
  total,
  updateTickets,
  onRefresh,
  isValidating = false,
  viewItems,
  activeViewKey,
  allCount,
  myCount,
  businessUnits,
}: TicketsTableBodyProps) {
  // Table instance ref for selection control
  const [tableInstance, setTableInstance] =
    useState<Table<TicketListItem> | null>(null);

  // Selection state
  const [selectedTickets, setSelectedTickets] = useState<TicketListItem[]>([]);

  const selectedIds = selectedTickets.map((t) => t.id);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedTickets([]);
    tableInstance?.resetRowSelection();
  }, [tableInstance]);

  // Create columns
  const columns = useMemo(() => createTicketsTableColumns(), []);

  // Memoize table data
  const tableData = useMemo(() => tickets, [tickets]);

  return (
    <div className="h-full flex flex-col min-h-0 space-y-2">
      {/* Controller Bar (same pattern as users page SettingsTableHeader) */}
      <TicketsTableController
        viewItems={viewItems}
        activeViewKey={activeViewKey}
        allCount={allCount}
        myCount={myCount}
        businessUnits={businessUnits}
        selectedIds={selectedIds}
        onClearSelection={handleClearSelection}
        onRefresh={onRefresh}
        isValidating={isValidating}
        tableInstance={tableInstance}
      />

      {/* DataTable */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DataTable<TicketListItem>
          columns={columns}
          _data={tableData}
          tableInstanceHook={(table) => setTableInstance(table)}
          onRowSelectionChange={setSelectedTickets}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={true}
        />
      </div>
    </div>
  );
}
