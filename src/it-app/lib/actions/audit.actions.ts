'use server';

import { internalGet } from '@/lib/fetch';
import type { AuditLogsResponse, AuditFilterOptions } from '@/types/audit';

export interface AuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  userId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export async function getAuditLogs(params: AuditLogsParams): Promise<AuditLogsResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('per_page', String(params.limit));
    if (params.action) searchParams.set('action', params.action);
    if (params.resourceType) searchParams.set('resource_type', params.resourceType);
    if (params.userId) searchParams.set('user_id', params.userId);
    if (params.search) searchParams.set('search', params.search);
    if (params.startDate) searchParams.set('start_date', params.startDate);
    if (params.endDate) searchParams.set('end_date', params.endDate);

    const qs = searchParams.toString();
    const response = await internalGet<AuditLogsResponse>(`/api/audit${qs ? `?${qs}` : ''}`);
    return response;
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return { data: [], pagination: { page: 1, perPage: 20, totalCount: 0, totalPages: 0 } };
  }
}

export async function getAuditFilterOptions(): Promise<AuditFilterOptions> {
  try {
    return await internalGet<AuditFilterOptions>('/api/audit/filter-options');
  } catch (error) {
    console.error('Error fetching audit filter options:', error);
    return { actions: [], resourceTypes: [], users: [] };
  }
}
