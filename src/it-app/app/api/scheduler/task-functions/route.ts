/**
 * Task Functions API Route
 * Proxy endpoint for fetching scheduler task functions
 *
 * GET /api/scheduler/task-functions - Get task functions
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
    const endpoint = `/scheduler/task-functions${queryString ? `?${queryString}` : ''}`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest('GET', endpoint);

    return NextResponse.json(response);
  } catch (error) {
    logError(error, 'Get Task Functions');

    const formattedError = formatApiError(error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve task functions',
        message: formattedError.message,
        details: formattedError.details,
        status: formattedError.status,
      },
      { status: formattedError.status }
    );
  }
}
