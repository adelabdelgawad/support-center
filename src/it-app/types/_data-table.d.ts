// Data table type definitions

import type { ColumnSort, ColumnFilter } from "@tanstack/react-table";

export interface DataTableConfig {
  operators: readonly string[];
  filterVariants: readonly string[];
  joinOperators: readonly string[];
}

export type FilterOperator = string;
export type FilterVariant = string;
export type JoinOperator = string;

export interface ExtendedColumnSort<TData> {
  id: Extract<keyof TData, string>;
  _id: Extract<keyof TData, string>; // Alias for backward compatibility
  desc: boolean;
}

export interface ExtendedColumnFilter<TData> {
  id: Extract<keyof TData, string>;
  _id: Extract<keyof TData, string>; // Alias for backward compatibility
  value: string | string[];
  operator: FilterOperator;
  variant: FilterVariant;
  filterId: string;
}
