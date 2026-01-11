/**
 * Reports API client for fetching dashboard and analytics data.
 */

import type {
  ExecutiveDashboardData,
  SLAComplianceData,
  VolumeReportData,
  AgentPerformanceData,
  SLAConfig,
  SLAConfigCreate,
  SLAConfigUpdate,
  EffectiveSLA,
  ReportConfig,
  ReportConfigCreate,
  ReportConfigUpdate,
  DateRangePreset,
} from "@/types/reports";

// =============================================================================
// Helper Functions
// =============================================================================

interface ReportQueryParams {
  datePreset?: DateRangePreset;
  startDate?: string;
  endDate?: string;
  businessUnitIds?: number[];
  technicianIds?: string[];
  priorityIds?: number[];
  statusIds?: number[];
  limit?: number;
}

function buildQueryString(params: ReportQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.datePreset) {
    searchParams.set("date_preset", params.datePreset);
  }
  if (params.startDate) {
    searchParams.set("start_date", params.startDate);
  }
  if (params.endDate) {
    searchParams.set("end_date", params.endDate);
  }
  if (params.businessUnitIds?.length) {
    searchParams.set("business_unit_ids", params.businessUnitIds.join(","));
  }
  if (params.technicianIds?.length) {
    searchParams.set("technician_ids", params.technicianIds.join(","));
  }
  if (params.priorityIds?.length) {
    searchParams.set("priority_ids", params.priorityIds.join(","));
  }
  if (params.statusIds?.length) {
    searchParams.set("status_ids", params.statusIds.join(","));
  }
  if (params.limit) {
    searchParams.set("limit", params.limit.toString());
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

async function fetchWithAuth<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// Dashboard APIs
// =============================================================================

/**
 * Get executive dashboard data with KPIs, trends, and distributions.
 */
export async function getExecutiveDashboard(
  params: ReportQueryParams = {}
): Promise<ExecutiveDashboardData> {
  const queryString = buildQueryString(params);
  return fetchWithAuth<ExecutiveDashboardData>(
    `/api/reports/dashboard/executive${queryString}`
  );
}

/**
 * Get operations dashboard with volume analysis.
 */
export async function getOperationsDashboard(
  params: ReportQueryParams = {}
): Promise<VolumeReportData> {
  const queryString = buildQueryString(params);
  return fetchWithAuth<VolumeReportData>(
    `/api/reports/dashboard/operations${queryString}`
  );
}

// =============================================================================
// SLA Reports
// =============================================================================

/**
 * Get SLA compliance report with breach analysis.
 */
export async function getSLAComplianceReport(
  params: ReportQueryParams = {}
): Promise<SLAComplianceData> {
  const queryString = buildQueryString(params);
  return fetchWithAuth<SLAComplianceData>(
    `/api/reports/sla/compliance${queryString}`
  );
}

// =============================================================================
// Agent Performance Reports
// =============================================================================

/**
 * Get agent performance report with rankings.
 */
export async function getAgentPerformanceReport(
  params: ReportQueryParams = {}
): Promise<AgentPerformanceData> {
  const queryString = buildQueryString(params);
  return fetchWithAuth<AgentPerformanceData>(
    `/api/reports/agents/performance${queryString}`
  );
}

// =============================================================================
// Volume Reports
// =============================================================================

/**
 * Get volume analysis report.
 */
export async function getVolumeAnalysisReport(
  params: ReportQueryParams = {}
): Promise<VolumeReportData> {
  const queryString = buildQueryString(params);
  return fetchWithAuth<VolumeReportData>(
    `/api/reports/volume/analysis${queryString}`
  );
}

// =============================================================================
// SLA Configuration APIs
// =============================================================================

/**
 * List all SLA configurations.
 */
export async function listSLAConfigs(params: {
  activeOnly?: boolean;
  priorityId?: number;
  categoryId?: number;
  businessUnitId?: number;
} = {}): Promise<SLAConfig[]> {
  const searchParams = new URLSearchParams();

  if (params.activeOnly !== undefined) {
    searchParams.set("active_only", params.activeOnly.toString());
  }
  if (params.priorityId) {
    searchParams.set("priority_id", params.priorityId.toString());
  }
  if (params.categoryId) {
    searchParams.set("category_id", params.categoryId.toString());
  }
  if (params.businessUnitId) {
    searchParams.set("business_unit_id", params.businessUnitId.toString());
  }

  const qs = searchParams.toString();
  return fetchWithAuth<SLAConfig[]>(`/api/sla-configs/${qs ? `?${qs}` : ""}`);
}

/**
 * Get a specific SLA configuration.
 */
export async function getSLAConfig(configId: number): Promise<SLAConfig> {
  return fetchWithAuth<SLAConfig>(`/api/sla-configs/${configId}`);
}

/**
 * Create a new SLA configuration.
 */
export async function createSLAConfig(data: SLAConfigCreate): Promise<SLAConfig> {
  return fetchWithAuth<SLAConfig>("/api/sla-configs/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update an SLA configuration.
 */
export async function updateSLAConfig(
  configId: number,
  data: SLAConfigUpdate
): Promise<SLAConfig> {
  return fetchWithAuth<SLAConfig>(`/api/sla-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Delete an SLA configuration.
 */
export async function deleteSLAConfig(configId: number): Promise<void> {
  await fetchWithAuth<void>(`/api/sla-configs/${configId}`, {
    method: "DELETE",
  });
}

/**
 * Get the effective SLA for a given context.
 */
export async function getEffectiveSLA(params: {
  priorityId: number;
  categoryId?: number;
  businessUnitId?: number;
}): Promise<EffectiveSLA> {
  const searchParams = new URLSearchParams();

  if (params.categoryId) {
    searchParams.set("category_id", params.categoryId.toString());
  }
  if (params.businessUnitId) {
    searchParams.set("business_unit_id", params.businessUnitId.toString());
  }

  const qs = searchParams.toString();
  return fetchWithAuth<EffectiveSLA>(
    `/api/sla-configs/effective/${params.priorityId}${qs ? `?${qs}` : ""}`
  );
}

// =============================================================================
// Report Configuration APIs
// =============================================================================

/**
 * List report configurations accessible to the current user.
 */
export async function listReportConfigs(params: {
  includePublic?: boolean;
  reportType?: string;
  activeOnly?: boolean;
} = {}): Promise<ReportConfig[]> {
  const searchParams = new URLSearchParams();

  if (params.includePublic !== undefined) {
    searchParams.set("include_public", params.includePublic.toString());
  }
  if (params.reportType) {
    searchParams.set("report_type", params.reportType);
  }
  if (params.activeOnly !== undefined) {
    searchParams.set("active_only", params.activeOnly.toString());
  }

  const qs = searchParams.toString();
  return fetchWithAuth<ReportConfig[]>(`/api/report-configs/${qs ? `?${qs}` : ""}`);
}

/**
 * Get a specific report configuration.
 */
export async function getReportConfig(configId: number): Promise<ReportConfig> {
  return fetchWithAuth<ReportConfig>(`/api/report-configs/${configId}`);
}

/**
 * Create a new report configuration.
 */
export async function createReportConfig(
  data: ReportConfigCreate
): Promise<ReportConfig> {
  return fetchWithAuth<ReportConfig>("/api/report-configs/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update a report configuration.
 */
export async function updateReportConfig(
  configId: number,
  data: ReportConfigUpdate
): Promise<ReportConfig> {
  return fetchWithAuth<ReportConfig>(`/api/report-configs/${configId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Delete a report configuration.
 */
export async function deleteReportConfig(configId: number): Promise<void> {
  await fetchWithAuth<void>(`/api/report-configs/${configId}`, {
    method: "DELETE",
  });
}
