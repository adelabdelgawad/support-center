/**
 * Request Details API Route
 *
 * Proxies the backend endpoint that returns basic request/ticket details.
 *
 * Backend endpoint: GET /api/v1/requests/{id}
 */

import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import {
  makeAuthenticatedRequest,
  getServerErrorMessage,
} from "@/lib/api/server-fetch";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/requests-details/[id]
 *
 * Returns basic ticket/request details including:
 * - Request metadata (title, description, status, priority, etc.)
 * - Requester information
 * - Timestamps
 *
 * For complete details including notes, assignees, and messages,
 * use /api/requests-details/[id]/full-details instead.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Invalid request ID format" },
        { status: 400 }
      );
    }

    // Call backend endpoint
    const response = await makeAuthenticatedRequest<unknown>(
      "GET",
      `/requests/${id}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Get request details error:", error);

    const message = getServerErrorMessage(error);
    const status =
      error instanceof ServerFetchError ? error.status : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve request details",
        detail: message,
      },
      { status }
    );
  }
}
