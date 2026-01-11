"use client";

import { Table } from "@tanstack/react-table";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrintButtonProps<TData> {
  table: Table<TData>;
  title?: string;
  page?: number;
}

export function PrintButton<TData>({
  table,
  title = "Data Table",
  page = 1,
}: PrintButtonProps<TData>) {
  const handlePrint = () => {
    // Do nothing if table is not ready
    if (!table) return;
    const visibleColumns = table
      .getVisibleFlatColumns()
      .filter((col) => col.id !== "select" && col.id !== "actions");

    const headersHtml = visibleColumns
      .map((col) =>
        typeof col.columnDef.header === "string" ? col.columnDef.header : col.id
      )
      .map((header) => `<th>${header}</th>`)
      .join("");

    const rowsHtml = table
      .getRowModel()
      .rows.map(
        (row) =>
          `<tr>` +
          visibleColumns
            .map((col) => {
              const columnId = col.id;
              return `<td>${row.getValue(columnId) ?? ""}</td>`;
            })
            .join("") +
          `</tr>`
      )
      .join("");

    const printContent = `
      <html>
        <head>
          <title>${title} - Page ${page}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 24px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9fafb; }
          </style>
        </head>
        <body>
          <h1>${title} - Page ${page}</h1>
          <table>
            <thead>
              <tr>${headersHtml}</tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "", "width=800,height=600");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} title="Print table">
      <Printer className="h-4 w-4" />
      Print
    </Button>
  );
}
