'use server';

import { serverGet } from '@/lib/fetch';
import type { Technician, Priority } from '@/types/metadata';

/**
 * Fetch all technicians (Server Action)
 * Uses backend endpoint with filters for active technicians
 *
 * Cache: REFERENCE_DATA (10 minutes) - dropdown options rarely change
 */
export async function getTechniciansData(): Promise<Technician[]> {
  try {
    const data = await serverGet<Technician[]>(
      '/users?is_technician=true&is_active=true',
      { revalidate: 0 }
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
    const data = await serverGet<Priority[]>(
      '/priorities/',
      { revalidate: 0 }
    );
    return data;
  } catch (error) {
    console.error('Error fetching priorities:', error);
    return [];
  }
}
