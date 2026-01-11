'use client';

/**
 * Client-side API for service sections
 * All calls go through Next.js API routes (/api/service-sections/*)
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';

export interface SectionTechnician {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
}

export interface ServiceSection {
  id: number;
  name: string;
  shownNameEn: string;
  shownNameAr: string;
  description?: string | null;
  isActive: boolean;
  isShown: boolean;
  technicians?: SectionTechnician[];
}

export interface ServiceSectionsResponse {
  sections?: ServiceSection[];
  items?: ServiceSection[];
  [key: string]: any;
}

const API_BASE = '/api/service-sections';

/**
 * Fetches all active service sections
 * @param onlyActive - Filter for active sections only (default: true)
 * @param onlyShown - Filter for sections shown in new request form (default: false for sub-task assignment)
 * @param includeTechnicians - Include technician assignments for each section (default: false)
 */
export async function getServiceSections(
  onlyActive: boolean = true,
  onlyShown: boolean = false,
  includeTechnicians: boolean = false
): Promise<ServiceSection[]> {
  try {
    // Build URL with query params
    const url = `${API_BASE}?only_active=${onlyActive}&only_shown=${onlyShown}&include_technicians=${includeTechnicians}`;
    const response = await apiClient.get<ServiceSectionsResponse | ServiceSection[]>(url);

    // Handle both possible response formats
    if (Array.isArray(response)) {
      return response;
    }
    const sections = response.sections || response.items || [];
    return Array.isArray(sections) ? sections : [];
  } catch (error) {
    console.error('Failed to fetch service sections:', error);
    throw new Error(getErrorMessage(error));
  }
}
