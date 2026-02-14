'use server';

import { internalGet } from '@/lib/fetch';
import type { Technician, Priority } from '@/types/metadata';

/**
 * Fetch all technicians (Server Action)
 * Uses backend endpoint with filters for active technicians
 *
 * Cache: REFERENCE_DATA (10 minutes) - dropdown options rarely change
 */
export async function getTechniciansData(): Promise<Technician[]> {
  try {
    const data = await internalGet<Technician[]>(
      '/api/users?is_technician=true&is_active=true'
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
    const data = await internalGet<Priority[]>(
      '/api/cache/priorities'
    );
    return data;
  } catch (error) {
    console.error('Error fetching priorities:', error);
    return [];
  }
}
