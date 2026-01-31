/**
 * Request Status by ID API Route
 * Handles fetching individual request status
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/request-statuses/[id] - Get request status by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/request-statuses/${id}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get request status ${await params.then(p => p.id)} error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ApiError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve request status",
        detail: message,
      },
      { status }
    );
  }
}
