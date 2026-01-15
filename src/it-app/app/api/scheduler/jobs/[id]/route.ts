/**
 * Scheduled Job by ID API Route
 * GET /api/scheduler/jobs/[id] - Get a single scheduled job with full details
 * PUT /api/scheduler/jobs/[id] - Update an existing scheduled job
 * DELETE /api/scheduler/jobs/[id] - Delete a scheduled job
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

/**
 * GET - Get a single scheduled job with full details including recent executions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/scheduler/jobs/${id}`
    );

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'Get Scheduled Job');
  }
}

/**
 * PUT - Update an existing scheduled job (all fields are optional)
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
      `/scheduler/jobs/${id}`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, 'Update Scheduled Job');
  }
}

/**
 * DELETE - Delete a scheduled job (system jobs cannot be deleted)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await makeAuthenticatedRequest<unknown>(
      'DELETE',
      `/scheduler/jobs/${id}`
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error, 'Delete Scheduled Job');
  }
}
