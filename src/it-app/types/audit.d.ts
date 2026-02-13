export interface AuditLog {
  id: number;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  endpoint: string | null;
  correlationId: string | null;
  userAgent: string | null;
  changesSummary: string | null;
  createdAt: string;
  username: string | null;
  userFullName: string | null;
}

export interface AuditLogsResponse {
  data: AuditLog[];
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface AuditUserOption {
  userId: string;
  username: string;
  fullName: string;
}

export interface AuditFilterOptions {
  actions: string[];
  resourceTypes: string[];
  users: AuditUserOption[];
}
