/**
 * Chat Messages by Request API Route
 * Proxy endpoint for fetching messages for a specific request
 *
 * GET /api/chat/messages/[requestId] - Get messages for a request
 */
import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { formatServerFetchError, logError } from '@/lib/api/error-handler';

interface RouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { requestId } = await context.params;
    const { searchParams } = new URL(request.url);

    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('perPage') || '50';

    // Build query string
    const queryString = `page=${page}&per_page=${perPage}`;
    const endpoint = `/chat/messages/request/${requestId}?${queryString}`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest('GET', endpoint);

    // Note: The backend returns X-Total-Count header, but we receive it as data
    return NextResponse.json(response);
  } catch (error) {
    // Use centralized error handler for better error messages
    logError(error, 'Get Chat Messages');

    const formattedError = formatServerFetchError(error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve messages',
        message: formattedError.message,
        details: formattedError.details,
        status: formattedError.status,
      },
      { status: formattedError.status }
    );
  }
}
