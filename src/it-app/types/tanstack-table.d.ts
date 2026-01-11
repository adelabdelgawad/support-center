// Type augmentation for @tanstack/react-table
// Adds custom _id property to Column definitions for backward compatibility

import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnDef<TData extends unknown = any, TValue = unknown> {
    _id?: string;
  }

  interface Column<TData extends unknown = any, TValue = unknown> {
    _id?: string;
  }

  interface Header<TData extends unknown = any, TValue = unknown> {
    _id?: string;
  }

  interface HeaderGroup<TData extends unknown = any> {
    _id?: string;
  }

  interface Row<TData extends unknown = any> {
    _id?: string;
  }

  interface Cell<TData extends unknown = any, TValue = unknown> {
    _id?: string;
  }

  interface ColumnFilter {
    _id?: string;
    operator?: string;
    variant?: string;
    filterId?: string;
  }
}
