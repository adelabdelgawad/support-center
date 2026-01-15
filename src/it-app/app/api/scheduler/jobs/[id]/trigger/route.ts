/**
 * Scheduled Job Trigger API Route
 * POST /api/scheduler/jobs/[id]/trigger - Manually trigger a job execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

/**
 * POST - Manually trigger a job execution
 *
 * Creates an execution record with triggered_by='manual'
 * and records the user who triggered the job.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await makeAuthenticatedRequest<unknown>(
      'POST',
      `/scheduler/jobs/${id}/trigger`
    );

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'Trigger Job');
  }
}
