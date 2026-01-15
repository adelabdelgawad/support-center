/**
 * Scheduled Jobs API Route
 * GET /api/scheduler/jobs - List all scheduled jobs with filtering and pagination
 * POST /api/scheduler/jobs - Create a new scheduled job
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

/**
 * GET - List all scheduled jobs with filtering and pagination
 *
 * Query params:
 * - name: Filter by job name (partial match)
 * - is_enabled: Filter by enabled status
 * - task_function_id: Filter by task function
 * - page: Page number (default: 1)
 * - per_page: Items per page (default: 20, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Build query string
    const queryParams = new URLSearchParams();

    const name = searchParams.get('name');
    if (name) queryParams.set('name', name);

    const isEnabled = searchParams.get('is_enabled');
    if (isEnabled !== null) queryParams.set('is_enabled', isEnabled);

    const taskFunctionId = searchParams.get('task_function_id');
    if (taskFunctionId) queryParams.set('task_function_id', taskFunctionId);

    const page = searchParams.get('page') || '1';
    queryParams.set('page', page);

    const perPage = searchParams.get('per_page') || '20';
    queryParams.set('per_page', perPage);

    const queryString = queryParams.toString();
    const endpoint = `/scheduler/jobs${queryString ? `?${queryString}` : ''}`;

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
    return handleRouteError(error, 'List Scheduled Jobs');
  }
}

/**
 * POST - Create a new scheduled job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest<unknown>(
      'POST',
      '/scheduler/jobs',
      body
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Create Scheduled Job');
  }
}
