 

import React from 'react';
import { ExtendedColumnFilter, FilterVariant, FilterOperator } from "@/types/_data-table";
import type { Column } from "@tanstack/react-table";


export function getCommonPinningStyles<TData>({
  column,
  withBorder = false,
}: {
  column: Column<TData>;
  withBorder?: boolean;
}): React.CSSProperties {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn =
    isPinned === "left" && column.getIsLastColumn("left");
  const isFirstRightPinnedColumn =
    isPinned === "right" && column.getIsFirstColumn("right");

  return {
    boxShadow: withBorder
      ? isLastLeftPinnedColumn
        ? "-4px 0 4px -4px hsl(var(--border)) inset"
        : isFirstRightPinnedColumn
          ? "4px 0 4px -4px hsl(var(--border)) inset"
          : undefined
      : undefined,
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? "sticky" : "relative",
    background: isPinned ? "hsl(var(--background))" : "hsl(var(--background))",
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
  };
}

// Define dataTableConfig with operator arrays for each filter type
const dataTableConfig = {
  textOperators: [
    { label: "Contains", value: "iLike" },
    { label: "Equals", value: "eq" },
    { label: "Does not equal", value: "ne" },
    { label: "Starts with", value: "startsWith" },
    { label: "Ends with", value: "endsWith" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
  ],
  numericOperators: [
    { label: "Equals", value: "eq" },
    { label: "Does not equal", value: "ne" },
    { label: "Greater than", value: "gt" },
    { label: "Less than", value: "lt" },
    { label: "Greater than or equal", value: "gte" },
    { label: "Less than or equal", value: "lte" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
  ],
  dateOperators: [
    { label: "Equals", value: "eq" },
    { label: "Before", value: "lt" },
    { label: "After", value: "gt" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
  ],
  booleanOperators: [
    { label: "Is true", value: "eq" },
    { label: "Is false", value: "ne" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
  ],
  selectOperators: [
    { label: "Equals", value: "eq" },
    { label: "Does not equal", value: "ne" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
  ],
  multiSelectOperators: [
    { label: "Contains", value: "in" },
    { label: "Does not contain", value: "notIn" },
    { label: "Is empty", value: "isEmpty" },
    { label: "Is not empty", value: "isNotEmpty" },
  ],
};

export function getFilterOperators(filterVariant: FilterVariant) {
  const operatorMap: Record<
    FilterVariant,
    { label: string; value: FilterOperator }[]
  > = {
    text: dataTableConfig.textOperators,
    number: dataTableConfig.numericOperators,
    range: dataTableConfig.numericOperators,
    date: dataTableConfig.dateOperators,
    dateRange: dataTableConfig.dateOperators,
    boolean: dataTableConfig.booleanOperators,
    select: dataTableConfig.selectOperators,
    multiSelect: dataTableConfig.multiSelectOperators,
  };

  return operatorMap[filterVariant] ?? dataTableConfig.textOperators;
}

export function getDefaultFilterOperator(filterVariant: FilterVariant) {
  const operators = getFilterOperators(filterVariant);

  return operators[0]?.value ?? (filterVariant === "text" ? "iLike" : "eq");
}

export function getValidFilters<TData>(
  filters: ExtendedColumnFilter<TData>[],
): ExtendedColumnFilter<TData>[] {
  return filters.filter(
    (filter) =>
      filter.operator === "isEmpty" ||
      filter.operator === "isNotEmpty" ||
      (Array.isArray(filter.value)
        ? filter.value.length > 0
        : filter.value !== "" &&
          filter.value !== null &&
          filter.value !== undefined),
  );
}
