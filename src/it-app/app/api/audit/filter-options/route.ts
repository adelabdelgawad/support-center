/**
 * Audit Filter Options API Route
 * Proxy endpoint for fetching audit filter options
 *
 * GET /api/audit/filter-options - Get audit filter options
 */
import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from '@/lib/fetch/errors';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { formatApiError, logError } from '@/lib/api/error-handler';

export async function GET(request: NextRequest) {
  try {
    const endpoint = '/audit/filter-options';

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest('GET', endpoint);

    return NextResponse.json(response);
  } catch (error) {
    logError(error, 'Get Audit Filter Options');

    const formattedError = formatApiError(error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve audit filter options',
        message: formattedError.message,
        details: formattedError.details,
        status: formattedError.status,
      },
      { status: formattedError.status }
    );
  }
}
