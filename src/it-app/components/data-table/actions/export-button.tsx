"use client";

import { Download } from "lucide-react";
import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";

interface ExportButtonProps<TData> {
  table: Table<TData>;
  filename?: string;
  page?: number;
}

export function ExportButton<TData>({
  table,
  filename = "export",
  page = 1,
}: ExportButtonProps<TData>) {
  const handleExport = () => {
    // Do nothing if table is not ready
    if (!table) return;
    // Get visible columns preserving order
    const visibleColumns = table
      .getVisibleFlatColumns()
      .filter((col) => col.id !== "select" && col.id !== "actions");

    // Compose CSV header row from visible column headers (string or fallback)
    const headerRow = visibleColumns
      .map((col) =>
        typeof col.columnDef.header === "string"
          ? col.columnDef.header
          : col.id
      )
      .join(",");

    // Compose CSV data rows from table rows and visible columns
    const dataRows = table.getRowModel().rows.map((row) =>
      visibleColumns
        .map((col) => {
          const columnId = col.id;
          const value = row.getValue(columnId);
          if (typeof value === "string" && value.includes(",")) {
            return `"${value}"`;
          }
          return value === undefined || value === null ? "" : value;
        })
        .join(",")
    );

    const csvContent = [headerRow, ...dataRows].join("\n");

    // Trigger CSV file download
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_page_${page}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      title="Export table to CSV"
    >
      <Download className="h-4 w-4" />
      Export
    </Button>
  );
}
