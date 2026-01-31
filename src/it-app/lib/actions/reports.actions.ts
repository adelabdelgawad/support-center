'use server';

import { serverGet } from '@/lib/fetch';
import type {
  VolumeReportData,
  AgentPerformanceData,
  SLAComplianceData,
  OutshiftGlobalReportData,
  DateRangePreset,
} from '@/types/reports';

/**
 * Server action to fetch volume analysis report data
 *
 * Cache: SHORT_LIVED (1 minute) - report data with fixed date preset
 */
export async function getVolumeAnalysisReportData(
  datePreset: DateRangePreset = 'last_30_days'
): Promise<VolumeReportData> {
  try {
    const data = await serverGet<VolumeReportData>(
      `/reports/volume/analysis?date_preset=${datePreset}`,
      { revalidate: 0 }
    );
    return data;
  } catch (error) {
    console.error('Error fetching volume analysis report:', error);
    throw error;
  }
}

/**
 * Server action to fetch agent performance report data
 *
 * Cache: SHORT_LIVED (1 minute) - report data with fixed date preset
 */
export async function getAgentPerformanceReportData(
  datePreset: DateRangePreset = 'last_30_days'
): Promise<AgentPerformanceData> {
  try {
    const data = await serverGet<AgentPerformanceData>(
      `/reports/agents/performance?date_preset=${datePreset}`,
      { revalidate: 0 }
    );
    return data;
  } catch (error) {
    console.error('Error fetching agent performance report:', error);
    throw error;
  }
}

/**
 * Server action to fetch SLA compliance report data
 *
 * Cache: SHORT_LIVED (1 minute) - report data with fixed date preset
 */
export async function getSLAComplianceReportData(
  datePreset: DateRangePreset = 'last_30_days'
): Promise<SLAComplianceData> {
  try {
    const data = await serverGet<SLAComplianceData>(
      `/reports/sla/compliance?date_preset=${datePreset}`,
      { revalidate: 0 }
    );
    return data;
  } catch (error) {
    console.error('Error fetching SLA compliance report:', error);
    throw error;
  }
}

/**
 * Server action to fetch operations dashboard data
 *
 * Cache: NO_CACHE - has many dynamic filter combinations, not suitable for caching
 */
export async function getOperationsDashboardData(
  datePreset: DateRangePreset = 'last_30_days',
  customStartDate?: string,
  customEndDate?: string,
  filters?: {
    businessUnitIds?: number[];
    technicianIds?: number[];
    priorityIds?: number[];
    statusIds?: number[];
  }
): Promise<VolumeReportData> {
  try {
    const searchParams = new URLSearchParams();
    searchParams.set('date_preset', datePreset);

    if (customStartDate) {
      searchParams.set('start_date', customStartDate);
    }
    if (customEndDate) {
      searchParams.set('end_date', customEndDate);
    }
    if (filters?.businessUnitIds?.length) {
      searchParams.set('business_unit_ids', filters.businessUnitIds.join(','));
    }
    if (filters?.technicianIds?.length) {
      searchParams.set('technician_ids', filters.technicianIds.join(','));
    }
    if (filters?.priorityIds?.length) {
      searchParams.set('priority_ids', filters.priorityIds.join(','));
    }
    if (filters?.statusIds?.length) {
      searchParams.set('status_ids', filters.statusIds.join(','));
    }

    const queryString = searchParams.toString();
    const data = await serverGet<VolumeReportData>(
      `/reports/dashboard/operations${queryString ? `?${queryString}` : ''}`,
      { revalidate: 0 }
    );
    return data;
  } catch (error) {
    console.error('Error fetching operations dashboard:', error);
    throw error;
  }
}

/**
 * Server action to fetch global outshift report data
 *
 * Cache: SHORT_LIVED (1 minute) - report data with fixed date preset
 */
export async function getOutshiftReportData(
  datePreset: DateRangePreset = 'last_30_days',
  businessUnitIds?: number[]
): Promise<OutshiftGlobalReportData> {
  try {
    const searchParams = new URLSearchParams();
    searchParams.set('date_preset', datePreset);

    if (businessUnitIds?.length) {
      searchParams.set('business_unit_ids', businessUnitIds.join(','));
    }

    const queryString = searchParams.toString();
    const data = await serverGet<OutshiftGlobalReportData>(
      `/reports/outshift/global${queryString ? `?${queryString}` : ''}`,
      { revalidate: 0 }
    );
    return data;
  } catch (error) {
    console.error('Error fetching outshift report:', error);
    throw error;
  }
}
