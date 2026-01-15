/**
 * Scheduler Status API Route
 * GET /api/scheduler/status - Get scheduler status
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

/**
 * GET - Get scheduler status including leader instance and job counts
 */
export async function GET(request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      '/scheduler/status'
    );

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'Get Scheduler Status');
  }
}
