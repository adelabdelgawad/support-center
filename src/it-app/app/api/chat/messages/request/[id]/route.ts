/**
 * Chat Messages API Route
 * Handles fetching chat messages for a specific request with delta sync support
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/chat/messages/request/[id] - Get chat messages for a request
 *
 * Query parameters:
 * - since_sequence: Delta sync - get messages with sequence > since_sequence
 * - start_sequence: Range query - get messages with sequence >= start_sequence
 * - end_sequence: Range query - get messages with sequence <= end_sequence
 * - limit: Cursor pagination - max messages to return
 * - before_sequence: Cursor pagination - get messages before this sequence
 * - page: Offset pagination - page number
 * - per_page: Offset pagination - items per page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = id;

    // Extract query parameters from the incoming request
    const searchParams = request.nextUrl.searchParams;

    // Build query string to pass to backend
    // Pass through all supported parameters
    const queryParams = new URLSearchParams();

    // Delta sync parameters
    if (searchParams.has('since_sequence')) {
      queryParams.append('since_sequence', searchParams.get('since_sequence')!);
    }
    if (searchParams.has('start_sequence')) {
      queryParams.append('start_sequence', searchParams.get('start_sequence')!);
    }
    if (searchParams.has('end_sequence')) {
      queryParams.append('end_sequence', searchParams.get('end_sequence')!);
    }

    // Cursor pagination parameters (existing)
    if (searchParams.has('limit')) {
      queryParams.append('limit', searchParams.get('limit')!);
    }
    if (searchParams.has('before_sequence')) {
      queryParams.append('before_sequence', searchParams.get('before_sequence')!);
    }

    // Offset pagination parameters (existing)
    if (searchParams.has('page')) {
      queryParams.append('page', searchParams.get('page')!);
    }
    if (searchParams.has('per_page')) {
      queryParams.append('per_page', searchParams.get('per_page')!);
    }

    // Call backend API with authentication
    const queryString = queryParams.toString();
    const endpoint = `/chat/messages/request/${requestId}${queryString ? `?${queryString}` : ''}`;

    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      endpoint
    );

    // Pass through all response headers from backend
    const headers = new Headers();

    // Important headers to forward (if response has headers)
    if (response && typeof response === 'object' && 'headers' in response) {
      const responseHeaders = response.headers as Record<string, string>;

      if (responseHeaders['X-Total-Count']) {
        headers.set('X-Total-Count', responseHeaders['X-Total-Count']);
      }
      if (responseHeaders['X-Oldest-Sequence']) {
        headers.set('X-Oldest-Sequence', responseHeaders['X-Oldest-Sequence']);
      }
      if (responseHeaders['X-Newest-Sequence']) {
        headers.set('X-Newest-Sequence', responseHeaders['X-Newest-Sequence']);
      }
      if (responseHeaders['X-Has-More']) {
        headers.set('X-Has-More', responseHeaders['X-Has-More']);
      }
      if (responseHeaders['X-Has-Newer']) {
        headers.set('X-Has-Newer', responseHeaders['X-Has-Newer']);
      }
    }

    return NextResponse.json(response, { headers });
  } catch (error) {
    console.error('Get chat messages error:', error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve chat messages",
        detail: message,
      },
      { status }
    );
  }
}
