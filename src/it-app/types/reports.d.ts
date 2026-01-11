/**
 * Report and Analytics type definitions.
 * These types match the backend schemas in schemas/reports/dashboard.py
 */

// =============================================================================
// Common Types
// =============================================================================

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "custom";

export interface ReportDateRange {
  preset?: DateRangePreset;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}

export interface ReportFilters {
  dateRange?: ReportDateRange;
  businessUnitIds?: number[];
  technicianIds?: string[];
  categoryIds?: number[];
  priorityIds?: number[];
  statusIds?: number[];
  tagIds?: number[];
}

// =============================================================================
// KPI Cards
// =============================================================================

export type TrendDirection = "up" | "down" | "stable";

export interface KPICard {
  id: string;
  label: string;
  value: number;
  unit?: string;
  previousValue?: number;
  changePercent?: number;
  trendDirection?: TrendDirection;
  target?: number;
  isTargetMet?: boolean;
}

export interface TrendDataPoint {
  date: string; // ISO date string
  value: number;
  label?: string;
}

export interface DistributionItem {
  id: string;
  label: string;
  value: number;
  percentage: number;
  color?: string;
}

// =============================================================================
// Executive Dashboard
// =============================================================================

export interface ExecutiveDashboardData {
  periodStart: string;
  periodEnd: string;
  comparisonPeriodStart?: string;
  comparisonPeriodEnd?: string;

  // Summary KPIs
  totalTickets: KPICard;
  resolvedTickets: KPICard;
  openTickets: KPICard;
  slaCompliance: KPICard;
  avgResolutionTime: KPICard;
  avgFirstResponseTime: KPICard;

  // Trends
  ticketVolumeTrend: TrendDataPoint[];
  slaComplianceTrend: TrendDataPoint[];

  // Distributions
  ticketsByStatus: DistributionItem[];
  ticketsByPriority: DistributionItem[];
  ticketsByCategory: DistributionItem[];
  ticketsByBusinessUnit: DistributionItem[];

  // Top performers
  topTechnicians: AgentRankingItem[];
}

// =============================================================================
// SLA Reports
// =============================================================================

export interface SLABreachItem {
  requestId: string;
  title: string;
  requesterName?: string;
  assignedTechnician?: string;
  priorityName: string;
  statusName: string;
  createdAt: string;
  slaDueAt: string;
  breachDurationMinutes: number;
  breachType: "first_response" | "resolution";
}

export interface SLAAgingBucket {
  bucketName: string;
  count: number;
  percentage: number;
  averageAgeHours: number;
}

export interface SLAComplianceData {
  periodStart: string;
  periodEnd: string;

  // Summary
  totalTickets: number;
  ticketsWithSla: number;
  slaMetCount: number;
  slaBreachedCount: number;
  overallComplianceRate: number;

  // First Response SLA
  firstResponseSlaMet: number;
  firstResponseSlaBreached: number;
  firstResponseComplianceRate: number;
  avgFirstResponseMinutes?: number;

  // Resolution SLA
  resolutionSlaMet: number;
  resolutionSlaBreached: number;
  resolutionComplianceRate: number;
  avgResolutionHours?: number;

  // Trends
  complianceTrend: TrendDataPoint[];
  firstResponseTrend: TrendDataPoint[];
  resolutionTrend: TrendDataPoint[];

  // Breakdown by priority
  complianceByPriority: DistributionItem[];

  // Aging analysis
  agingBuckets: SLAAgingBucket[];

  // Recent breaches
  recentBreaches: SLABreachItem[];
}

// =============================================================================
// Volume Reports
// =============================================================================

export interface VolumeTrendItem {
  date: string;
  createdCount: number;
  resolvedCount: number;
  closedCount: number;
  netChange: number;
}

export interface CategoryVolumeItem {
  categoryId: number;
  categoryName: string;
  ticketCount: number;
  percentage: number;
  avgResolutionHours?: number;
  slaComplianceRate?: number;
}

export interface BusinessUnitVolumeItem {
  businessUnitId: number;
  businessUnitName: string;
  ticketCount: number;
  percentage: number;
  openCount: number;
  resolvedCount: number;
  avgResolutionHours?: number;
}

export interface VolumeReportData {
  periodStart: string;
  periodEnd: string;

  // Summary
  totalCreated: number;
  totalResolved: number;
  totalClosed: number;
  totalReopened: number;
  currentBacklog: number;
  backlogChange: number;

  // KPIs
  avgTicketsPerDay: number;
  peakDay?: string;
  peakDayCount: number;

  // Trends
  volumeTrend: VolumeTrendItem[];

  // Distributions
  hourlyDistribution: DistributionItem[];
  dayOfWeekDistribution: DistributionItem[];

  // Breakdowns
  byCategory: CategoryVolumeItem[];
  byBusinessUnit: BusinessUnitVolumeItem[];
  byPriority: DistributionItem[];
}

// =============================================================================
// Agent Performance Reports
// =============================================================================

export interface AgentRankingItem {
  rank: number;
  technicianId: string;
  technicianName: string;
  fullName?: string;

  // Performance metrics
  ticketsResolved: number;
  ticketsAssigned: number;
  openTickets: number;
  resolutionRate: number;
  avgResolutionHours?: number;
  avgFirstResponseMinutes?: number;
  slaComplianceRate?: number;

  // Change from previous period
  rankChange?: number;
}

export interface WorkloadDistributionItem {
  technicianId: string;
  technicianName: string;
  fullName?: string;
  openTickets: number;
  overdueTickets: number;
  ticketsDueToday: number;
  ticketsAssignedToday: number;
  capacityPercentage?: number;
}

export interface AgentPerformanceData {
  periodStart: string;
  periodEnd: string;

  // Team summary
  totalTechnicians: number;
  activeTechnicians: number;
  totalTicketsHandled: number;
  avgTicketsPerTechnician: number;

  // Team averages
  teamAvgResolutionHours?: number;
  teamAvgFirstResponseMinutes?: number;
  teamSlaComplianceRate?: number;

  // Rankings
  topPerformers: AgentRankingItem[];
  needsAttention: AgentRankingItem[];

  // Workload distribution
  workloadDistribution: WorkloadDistributionItem[];

  // Distribution charts
  ticketsByTechnician: DistributionItem[];
  resolutionTimeDistribution: DistributionItem[];
}

// =============================================================================
// SLA Configuration
// =============================================================================

export interface SLAConfig {
  id: number;
  priorityId: number;
  categoryId?: number;
  businessUnitId?: number;
  firstResponseMinutes: number;
  resolutionHours: number;
  businessHoursOnly: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Nested info
  priority?: {
    id: number;
    name: string;
  };
  category?: {
    id: number;
    name: string;
    nameEn?: string;
    nameAr?: string;
  };
  businessUnit?: {
    id: number;
    name: string;
  };
}

export interface SLAConfigCreate {
  priorityId: number;
  categoryId?: number;
  businessUnitId?: number;
  firstResponseMinutes: number;
  resolutionHours: number;
  businessHoursOnly?: boolean;
}

export interface SLAConfigUpdate {
  priorityId?: number;
  categoryId?: number;
  businessUnitId?: number;
  firstResponseMinutes?: number;
  resolutionHours?: number;
  businessHoursOnly?: boolean;
  isActive?: boolean;
}

export interface EffectiveSLA {
  firstResponseMinutes: number;
  resolutionHours: number;
  businessHoursOnly: boolean;
  source: "sla_config" | "priority" | "default";
  configId?: number;
  priorityId?: number;
}

// =============================================================================
// Report Configuration
// =============================================================================

export type ReportType =
  | "executive"
  | "executive_dashboard"
  | "operations_dashboard"
  | "agent_performance"
  | "sla_compliance"
  | "volume"
  | "volume_analysis"
  | "category_analysis"
  | "category_breakdown"
  | "business_unit"
  | "custom";

export interface ReportConfig {
  id: number;
  name: string;
  description?: string;
  reportType: ReportType;
  filters: Record<string, unknown>;
  displayConfig: Record<string, unknown>;
  scheduleCron?: string;
  recipients?: string[];
  lastRunAt?: string;
  createdById: string;
  isPublic: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Nested info
  createdBy?: {
    id: string;
    username: string;
    fullName?: string;
  };
}

export interface ReportConfigCreate {
  name: string;
  description?: string;
  reportType: ReportType;
  filters?: Record<string, unknown>;
  displayConfig?: Record<string, unknown>;
  scheduleCron?: string;
  recipients?: string[];
  isPublic?: boolean;
  isActive?: boolean;
  filterConfig?: Record<string, unknown>;
}

export interface ReportConfigUpdate {
  name?: string;
  description?: string;
  reportType?: ReportType;
  filters?: Record<string, unknown>;
  displayConfig?: Record<string, unknown>;
  scheduleCron?: string;
  recipients?: string[];
  isPublic?: boolean;
  isActive?: boolean;
  filterConfig?: Record<string, unknown>;
}

// =============================================================================
// Outshift Reports
// =============================================================================

export interface OutshiftAgentBUMetrics {
  businessUnitId: number;
  businessUnitName: string;
  hasWorkingHours: boolean;
  totalActivityMinutes: number;
  inShiftMinutes: number;
  outShiftMinutes: number;
  outShiftPercentage: number;
  outShiftSessionsCount: number;
  outShiftTicketsCount: number;
}

export interface OutshiftAgentSummary {
  agentId: string;
  agentName: string;
  agentFullName?: string;
  totalActivityMinutes: number;
  totalOutShiftMinutes: number;
  totalOutShiftPercentage: number;
  businessUnitCount: number;
  outShiftSessionsCount: number;
  outShiftTicketsCount: number;
  rank: number;
}

export interface OutshiftGlobalReportData {
  periodStart: string;
  periodEnd: string;
  totalAgents: number;
  agentsWithActivity: number;
  agentsWithOutshift: number;
  totalActivityMinutes: number;
  totalInShiftMinutes: number;
  totalOutShiftMinutes: number;
  overallOutShiftPercentage: number;
  avgOutShiftPercentage: number;
  agentRankings: OutshiftAgentSummary[];
  hasData: boolean;
}

export interface OutshiftAgentReportData {
  periodStart: string;
  periodEnd: string;
  agentId: string;
  agentName: string;
  agentFullName?: string;
  totalActivityMinutes: number;
  totalInShiftMinutes: number;
  totalOutShiftMinutes: number;
  totalOutShiftPercentage: number;
  businessUnitMetrics: OutshiftAgentBUMetrics[];
  hasActivity: boolean;
  hasBuAssignments: boolean;
}
