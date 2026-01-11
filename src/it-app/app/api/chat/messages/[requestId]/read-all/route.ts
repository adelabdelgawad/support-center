/**
 * Mark All Messages as Read API Route
 * Proxy endpoint for marking all messages in a request as read
 *
 * POST /api/chat/messages/[requestId]/read-all - Mark all messages as read
 */
import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { formatServerFetchError, logError } from '@/lib/api/error-handler';

interface RouteContext {
  params: Promise<{
    requestId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { requestId } = await context.params;

    const endpoint = `/chat/messages/request/${requestId}/read-all`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest('POST', endpoint, {});

    return NextResponse.json(response);
  } catch (error) {
    // Use centralized error handler for better error messages
    logError(error, 'Mark Messages as Read');

    const formattedError = formatServerFetchError(error);

    return NextResponse.json(
      {
        error: 'Failed to mark messages as read',
        message: formattedError.message,
        details: formattedError.details,
        status: formattedError.status,
      },
      { status: formattedError.status }
    );
  }
}
