/**
 * Sub-tasks Statistics API Route
 * Handles fetching statistics for sub-tasks of a parent request
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend response returned to client
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import {
  makeAuthenticatedRequest,
  getServerErrorMessage,
} from "@/lib/api/server-fetch";

/**
 * GET /api/requests/[id]/sub-tasks/stats - Get statistics for sub-tasks
 *
 * Returns:
 * - total: Total number of sub-tasks
 * - by_status: Object with counts by status ID
 * - blocked_count: Number of blocked sub-tasks
 * - overdue_count: Number of overdue sub-tasks
 * - completed_count: Number of completed sub-tasks
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const endpoint = `/requests/${id}/sub-tasks/stats`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>("GET", endpoint);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get sub-tasks stats error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve sub-tasks statistics",
        detail: message,
      },
      { status }
    );
  }
}
