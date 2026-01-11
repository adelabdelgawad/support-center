"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowUpDown } from "lucide-react";

export interface ListColumn<T = any> {
  id: string;
  label: string;
  width?: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  accessor?: keyof T;
}

export interface ListAction<T = any> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (item: T) => void;
  variant?: "default" | "destructive";
}

interface ListViewTemplateProps<T = any> {
  columns: ListColumn<T>[];
  data: T[];
  actions?: ListAction<T>[];
  onItemClick?: (item: T) => void;
  selectable?: boolean;
  selectedItems?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  emptyState?: React.ReactNode;
  getItemId?: (item: T) => string;
  className?: string;
}

export function ListViewTemplate<T = any>({
  columns,
  data,
  actions = [],
  onItemClick,
  selectable = false,
  selectedItems = new Set(),
  onSelectionChange,
  emptyState,
  getItemId = (item: any) => item.id,
  className,
}: ListViewTemplateProps<T>) {
  const [sortColumn, setSortColumn] = React.useState<string | null>(null);
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
    "asc"
  );

  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(columnId);
      setSortDirection("asc");
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;

    if (checked) {
      const allIds = new Set(data.map((item) => getItemId(item)));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    if (!onSelectionChange) return;

    const newSelection = new Set(selectedItems);
    if (checked) {
      newSelection.add(itemId);
    } else {
      newSelection.delete(itemId);
    }
    onSelectionChange(newSelection);
  };

  const allSelected =
    data.length > 0 && selectedItems.size === data.length;
  const someSelected = selectedItems.size > 0 && !allSelected;

  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        {emptyState || (
          <div className="text-center text-muted-foreground p-8">
            <p className="text-sm">No items to display</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <Card className="flex-1 rounded-none border-x-0 border-t-0 shadow-none overflow-hidden">
        {/* List Header */}
        <div className="sticky top-0 z-10 bg-muted/50 border-b border-border">
          <div className="flex items-center min-w-max">
            {selectable && (
              <div className="w-12 flex items-center justify-center shrink-0">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                  className={cn(someSelected && "data-[state=checked]:bg-primary/50")}
                />
              </div>
            )}

            {columns.map((column) => (
              <div
                key={column.id}
                className={cn(
                  "flex items-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                  column.width || "flex-1",
                  column.sortable && "cursor-pointer hover:bg-muted/50"
                )}
                onClick={() => column.sortable && handleSort(column.id)}
              >
                {column.label}
                {column.sortable && (
                  <ArrowUpDown className={cn(
                    "ml-2 h-3 w-3",
                    sortColumn === column.id && "text-primary"
                  )} />
                )}
              </div>
            ))}

            {actions.length > 0 && (
              <div className="w-12 shrink-0" />
            )}
          </div>
        </div>

        {/* List Body */}
        <div className="overflow-y-auto">
          {data.map((item, index) => {
            const itemId = getItemId(item);
            const isSelected = selectedItems.has(itemId);

            return (
              <div
                key={itemId}
                className={cn(
                  "office-list-row flex items-center min-w-max border-b border-border last:border-b-0",
                  isSelected && "bg-primary/5",
                  onItemClick && "cursor-pointer"
                )}
                onClick={() => onItemClick?.(item)}
              >
                {selectable && (
                  <div
                    className="w-12 flex items-center justify-center shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        handleSelectItem(itemId, !!checked)
                      }
                      aria-label={`Select item ${index + 1}`}
                    />
                  </div>
                )}

                {columns.map((column) => (
                  <div
                    key={column.id}
                    className={cn(
                      "px-4 py-3 text-sm overflow-hidden",
                      column.width || "flex-1"
                    )}
                  >
                    {column.render
                      ? column.render(item)
                      : column.accessor
                      ? String(item[column.accessor] || "")
                      : ""}
                  </div>
                ))}

                {actions.length > 0 && (
                  <div
                    className="w-12 flex items-center justify-center shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-6 w-6"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {actions.map((action) => (
                          <DropdownMenuItem
                            key={action.id}
                            onClick={() => action.onClick(item)}
                            variant={action.variant}
                          >
                            {action.icon && (
                              <span className="mr-2">{action.icon}</span>
                            )}
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
