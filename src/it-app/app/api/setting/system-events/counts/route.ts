/**
 * System Events Counts API Route
 * Proxy endpoint for fetching system events counts
 *
 * GET /api/setting/system-events/counts - Get system events counts
 */
import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from '@/lib/fetch/errors';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { formatApiError, logError } from '@/lib/api/error-handler';

export async function GET(request: NextRequest) {
  try {
    const endpoint = '/system-events/counts';

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest('GET', endpoint);

    return NextResponse.json(response);
  } catch (error) {
    logError(error, 'Get System Events Counts');

    const formattedError = formatApiError(error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve system events counts',
        message: formattedError.message,
        details: formattedError.details,
        status: formattedError.status,
      },
      { status: formattedError.status }
    );
  }
}
