/**
 * Scheduled Job Status API Route
 * PUT /api/scheduler/jobs/[id]/status - Enable or disable a scheduled job
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

/**
 * PUT - Enable or disable a scheduled job
 *
 * Request body:
 * - is_enabled: boolean - Whether to enable or disable the job
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await makeAuthenticatedRequest<unknown>(
      'PUT',
      `/scheduler/jobs/${id}/status`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'Toggle Job Status');
  }
}
