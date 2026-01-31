import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';
import { ApiError } from '@/lib/fetch/errors';

/**
 * GET /api/metadata/statuses
 *
 * Fetch available request statuses from backend
 */
export async function GET(request: NextRequest) {
  try {
    // Backend returns { statuses: [...], total, active_count, ... }
    const response = await makeAuthenticatedRequest<{
      statuses: any[];
      total: number;
      active_count: number;
      inactive_count: number;
      readonly_count: number;
    }>(
      'GET',
      '/request-statuses?is_active=true'
    );

    // Extract just the statuses array
    const statuses = response.statuses || [];

    return NextResponse.json(statuses);
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status = error instanceof ApiError ? error.status : 500;

    return NextResponse.json(
      { error: 'Failed to fetch statuses', detail: message },
      { status }
    );
  }
}
