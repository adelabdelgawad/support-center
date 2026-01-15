/**
 * Scheduled Job Executions API Route
 * GET /api/scheduler/jobs/[id]/executions - Get execution history for a specific job
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

/**
 * GET - Get execution history for a specific job
 *
 * Query params:
 * - status: Filter by execution status
 * - page: Page number (default: 1)
 * - per_page: Items per page (default: 50, max: 100)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    // Build query string
    const queryParams = new URLSearchParams();

    const status = searchParams.get('status');
    if (status) queryParams.set('status', status);

    const page = searchParams.get('page') || '1';
    queryParams.set('page', page);

    const perPage = searchParams.get('per_page') || '50';
    queryParams.set('per_page', perPage);

    const queryString = queryParams.toString();
    const endpoint = `/scheduler/jobs/${id}/executions${queryString ? `?${queryString}` : ''}`;

    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      endpoint
    );

    // Return response with pagination headers
    const headers = new Headers();
    if (response && typeof response === 'object' && 'total' in response) {
      headers.set('X-Total-Count', String((response as { total: number }).total));
    }
    headers.set('X-Page', page);
    headers.set('X-Per-Page', perPage);

    return NextResponse.json(response, { headers });
  } catch (error) {
    return handleRouteError(error, 'List Job Executions');
  }
}
