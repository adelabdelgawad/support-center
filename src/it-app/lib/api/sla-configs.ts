'use client';

import { api } from '@/lib/fetch/client';
import type {
  SLAConfigResponse,
  SLAConfigCreateRequest,
  SLAConfigUpdateRequest,
} from '@/types/sla-configs';

export async function createSLAConfig(
  data: SLAConfigCreateRequest
): Promise<SLAConfigResponse> {
  return api.post<SLAConfigResponse>('/api/sla-configs', data);
}

export async function updateSLAConfig(
  id: number,
  data: SLAConfigUpdateRequest
): Promise<SLAConfigResponse> {
  return api.patch<SLAConfigResponse>(`/api/sla-configs/${id}`, data);
}

export async function deleteSLAConfig(id: number): Promise<void> {
  await api.delete(`/api/sla-configs/${id}`);
}
