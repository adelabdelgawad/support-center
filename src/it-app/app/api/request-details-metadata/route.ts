/**
 * Request Details Metadata API Route
 *
 * GET /api/request-details-metadata
 *
 * Consolidated endpoint that fetches all metadata needed for request details page:
 * - Priorities
 * - Statuses
 * - Technicians
 * - Categories with subcategories
 *
 * This reduces 4 separate API calls into 1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

/**
 * GET handler for request details metadata
 */
export async function GET(request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest<{
      priorities: any[];
      statuses: any[];
      technicians: any[];
      categories: any[];
    }>('GET', '/request-details-metadata');

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[API] Error fetching request details metadata:', error);

    return NextResponse.json(
      {
        detail: error.message || 'Failed to fetch request details metadata',
      },
      { status: error.response?.status || 500 }
    );
  }
}
