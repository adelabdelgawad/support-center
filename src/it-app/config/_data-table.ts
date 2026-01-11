// Data table configuration

export const DATA_TABLE_CONFIG = {
  defaultPageSize: 20,
  pageSizeOptions: [10, 20, 50, 100],
  operators: ["eq", "ne", "gt", "lt", "contains", "startsWith", "endsWith"] as const,
  filterVariants: ["text", "number", "select", "date", "boolean"] as const,
  joinOperators: ["and", "or"] as const,
};

// Alias for backward compatibility
export const dataTableConfig = DATA_TABLE_CONFIG;
