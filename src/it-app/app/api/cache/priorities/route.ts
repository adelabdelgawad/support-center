/**
 * Cache Priorities API Route
 * Proxy endpoint for fetching cached priorities
 *
 * GET /api/cache/priorities - Get cached priorities
 */
import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from '@/lib/fetch/errors';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { formatApiError, logError } from '@/lib/api/error-handler';

export async function GET(request: NextRequest) {
  try {
    const endpoint = '/cache/priorities';

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest('GET', endpoint);

    return NextResponse.json(response);
  } catch (error) {
    logError(error, 'Get Cached Priorities');

    const formattedError = formatApiError(error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve cached priorities',
        message: formattedError.message,
        details: formattedError.details,
        status: formattedError.status,
      },
      { status: formattedError.status }
    );
  }
}
