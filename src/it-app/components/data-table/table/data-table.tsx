"use client";

import React, { useState, useEffect } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  VisibilityState,
  RowSelectionState,
  Table as TanStackTable,
} from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "./table-skeleton";

interface DataTableProps<TData> {
  _data: TData[];
  columns: ColumnDef<TData>[];
  onRowSelectionChange?: (selectedRows: TData[]) => void;
  renderToolbar?: (table: TanStackTable<TData>) => React.ReactNode;
  _isLoading?: boolean;
  tableInstanceHook?: (tableInstance: TanStackTable<TData>) => void;
  enableRowSelection?: boolean;
  enableSorting?: boolean;
}

export function DataTable<TData>({
  _data,
  columns,
  onRowSelectionChange,
  renderToolbar,
  _isLoading = false,
  tableInstanceHook,
  enableRowSelection = true,
  enableSorting = true,
}: DataTableProps<TData>) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: _data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      columnVisibility,
      rowSelection,
    },
    enableRowSelection,
    enableSorting,
  });

  useEffect(() => {
    if (onRowSelectionChange) {
      const selectedRows = table
        .getFilteredSelectedRowModel()
        .rows.map((row) => row.original);
      onRowSelectionChange(selectedRows);
    }
  }, [rowSelection, onRowSelectionChange, table]);

  useEffect(() => {
    if (tableInstanceHook) {
      tableInstanceHook(table);
    }
  }, [table, tableInstanceHook]);

  useEffect(() => {
    (window as any).__resetTableSelection = () => {
      setRowSelection({});
    };
    return () => {
      delete (window as any).__resetTableSelection;
    };
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {renderToolbar && renderToolbar(table)}

      <div className="flex-1 overflow-auto bg-background min-h-0 relative rounded-md border touch-pan-x touch-pan-y">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="align-middle font-semibold h-12"
                  >
                    <div className="flex items-center justify-center h-full w-full">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {_isLoading ? (
              <TableSkeleton columns={columns.length} rows={10} />
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const isSelected = row.getIsSelected();
                return (
                  <TableRow
                    key={row.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('input[type="checkbox"]')) {
                        return;
                      }
                      row.toggleSelected();
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="align-middle h-12"
                      >
                        <div className="flex items-center justify-center h-full w-full">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-12 text-muted-foreground"
                >
                  No data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
