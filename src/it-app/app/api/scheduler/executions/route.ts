/**
 * Executions API Route
 * Proxy endpoint for fetching scheduler executions
 *
 * GET /api/scheduler/executions - Get executions
 */
import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from '@/lib/fetch/errors';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { formatApiError, logError } from '@/lib/api/error-handler';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Build query string
    const queryString = searchParams.toString();
    const endpoint = `/scheduler/executions${queryString ? `?${queryString}` : ''}`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest('GET', endpoint);

    return NextResponse.json(response);
  } catch (error) {
    logError(error, 'Get Executions');

    const formattedError = formatApiError(error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve executions',
        message: formattedError.message,
        details: formattedError.details,
        status: formattedError.status,
      },
      { status: formattedError.status }
    );
  }
}
