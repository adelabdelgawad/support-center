"use client";

import { Columns3 } from "lucide-react";
import { useEffect, useState } from "react";
import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ColumnToggleButtonProps<TData> {
  table: Table<TData>;
}

// Helper function to convert columnId like "enName" to "EN Name"
function prettifyColumnName(columnId: string): string {
  // Remove leading 'Is' or 'is'
  const withoutIs = columnId.replace(/^is/i, "");

  // Insert spaces before capital letters
  const spaced = withoutIs.replace(/([A-Z])/g, " $1").trim();

  // Capitalize words, but fully uppercase if word length < 3
  const words = spaced.split(" ").map((word) => {
    return word.length < 3
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return words.join(" ");
}

export function ColumnToggleButton<TData>({
  table,
}: ColumnToggleButtonProps<TData>) {
  const [columnVisibility, setColumnVisibility] = useState(
    () => table?.getState().columnVisibility || {}
  );

  // Sync with table state whenever it changes
  useEffect(() => {
    if (!table) return;

    const updateVisibility = () => {
      setColumnVisibility({ ...table.getState().columnVisibility });
    };

    // Update immediately
    updateVisibility();

    // Set up a listener - using a small interval as fallback
    const interval = setInterval(updateVisibility, 100);

    return () => clearInterval(interval);
  }, [table]);

  if (!table) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            const columnId = column.id;
            const isVisible = columnVisibility[columnId] !== false;

            return (
              <DropdownMenuCheckboxItem
                key={columnId}
                checked={isVisible}
                onCheckedChange={(checked) => {
                  column.toggleVisibility(checked);
                  setColumnVisibility({
                    ...table.getState().columnVisibility,
                  });
                }}
              >
                {prettifyColumnName(columnId)}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
