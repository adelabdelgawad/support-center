'use server';

import { serverGet } from '@/lib/fetch';
import type { SLAConfigResponse } from '@/types/sla-configs';

/**
 * Fetches all SLA configurations
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getSLAConfigs(): Promise<SLAConfigResponse[]> {
  try {
    return await serverGet<SLAConfigResponse[]>('/sla-configs/', {
      revalidate: 0,
    });
  } catch (error) {
    console.error('Error fetching SLA configs:', error);
    return [];
  }
}
