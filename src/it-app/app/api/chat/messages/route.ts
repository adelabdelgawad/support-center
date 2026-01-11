/**
 * Chat Messages API Route
 * Proxy endpoint for creating chat messages
 *
 * POST /api/chat/messages - Create a new chat message
 *
 * Note: Backend auto-populates sender_id from JWT token.
 * Permission validation is handled by the backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { makeAuthenticatedRequest, ServerFetchError, getServerErrorMessage } from '@/lib/api/server-fetch';

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  console.log(`[chat/messages:${requestId}] POST request received`);

  try {
    // Check for access token cookie
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('access_token')?.value;
    console.log(`[chat/messages:${requestId}] Access token present: ${!!accessToken}`);

    if (!accessToken) {
      console.error(`[chat/messages:${requestId}] No access_token cookie found`);
      return NextResponse.json(
        { error: 'Authentication required', detail: 'No access token found. Please log in again.' },
        { status: 401 }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
      console.log(`[chat/messages:${requestId}] Body parsed:`, {
        request_id: body.request_id,
        content_length: body.content?.length || 0,
        client_temp_id: body.client_temp_id,
      });
    } catch (parseError) {
      console.error(`[chat/messages:${requestId}] Failed to parse request body:`, parseError);
      return NextResponse.json(
        { error: 'Invalid request', detail: 'Could not parse request body as JSON' },
        { status: 400 }
      );
    }

    const { request_id, content } = body;

    // Validate required fields
    if (!request_id) {
      console.error(`[chat/messages:${requestId}] Missing request_id`);
      return NextResponse.json(
        { error: 'Validation failed', detail: 'Missing required field: request_id' },
        { status: 400 }
      );
    }

    if (!content?.trim()) {
      console.error(`[chat/messages:${requestId}] Missing or empty content`);
      return NextResponse.json(
        { error: 'Validation failed', detail: 'Missing required field: content' },
        { status: 400 }
      );
    }

    console.log(`[chat/messages:${requestId}] Forwarding to FastAPI backend...`);

    // Forward to backend - sender_id is auto-populated from JWT by backend
    const response = await makeAuthenticatedRequest<Record<string, unknown>>(
      'POST',
      '/chat/messages',
      {
        request_id,
        content: content.trim(),
        is_screenshot: body.is_screenshot || false,
        screenshot_file_name: body.screenshot_file_name || null,
        client_temp_id: body.client_temp_id || null,
        // File attachment fields (for non-image files)
        file_name: body.file_name || null,
        file_size: body.file_size || null,
        file_mime_type: body.file_mime_type || null,
      }
    );

    console.log(`[chat/messages:${requestId}] Backend response received:`, {
      id: response.id,
      sequenceNumber: response.sequenceNumber,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const status = error instanceof ServerFetchError ? error.status : 500;
    const message = getServerErrorMessage(error);

    console.error(`[chat/messages:${requestId}] Error (status: ${status}):`, {
      message,
      isServerFetchError: error instanceof ServerFetchError,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Failed to send message', detail: message },
      { status }
    );
  }
}
