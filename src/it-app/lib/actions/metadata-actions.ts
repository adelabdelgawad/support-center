'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
import type { Technician, Priority } from '@/types/metadata';

/**
 * Fetch all technicians (Server Action)
 * Uses backend endpoint with filters for active technicians
 *
 * Cache: REFERENCE_DATA (10 minutes) - dropdown options rarely change
 */
export async function getTechniciansData(): Promise<Technician[]> {
  try {
    const data = await serverFetch<Technician[]>(
      '/users?is_technician=true&is_active=true',
      CACHE_PRESETS.REFERENCE_DATA('technicians')
    );
    return data;
  } catch (error) {
    console.error('Error fetching technicians:', error);
    return [];
  }
}

/**
 * Fetch all priorities (Server Action)
 * Uses cached endpoint for optimal performance
 *
 * Cache: REFERENCE_DATA (10 minutes) - priorities rarely change
 */
export async function getPrioritiesData(): Promise<Priority[]> {
  try {
    const data = await serverFetch<Priority[]>(
      '/priorities/',
      CACHE_PRESETS.REFERENCE_DATA('priorities')
    );
    return data;
  } catch (error) {
    console.error('Error fetching priorities:', error);
    return [];
  }
}
