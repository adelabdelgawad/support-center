/**
 * Chat Messages API Route
 * Handles fetching chat messages for a specific request
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/chat/messages/request/[id] - Get chat messages for a request
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = id;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/chat/messages/request/${requestId}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get chat messages error:', error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ApiError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve chat messages",
        detail: message,
      },
      { status }
    );
  }
}
