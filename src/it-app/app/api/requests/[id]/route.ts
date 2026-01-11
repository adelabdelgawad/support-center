/**
 * Service Request by ID API Route
 * Handles individual service request operations
 *
 * Route: /api/requests/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/requests/[id] - Get service request by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId: string = '';
  try {
    const { id } = await params;
    requestId = id;

    // Validate ID is a UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      return NextResponse.json(
        {
          error: "Validation error",
          detail: "Request ID must be a valid UUID",
        },
        { status: 400 }
      );
    }

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/requests/${requestId}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get service request ${requestId} error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve service request",
        detail: message,
      },
      { status }
    );
  }
}
