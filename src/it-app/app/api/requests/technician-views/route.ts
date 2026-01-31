/**
 * Technician Views API Route
 * Handles fetching service requests for different technician views
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
 * GET /api/requests/technician-views - Get requests for technician views
 *
 * Query Parameters:
 * - view: View type (unassigned, all_unsolved, my_unsolved, recently_updated, recently_solved)
 * - page: Page number (default: 1)
 * - perPage: Items per page (default: 20, max: 100)
 * - business_unit_ids: Optional business unit IDs to filter by (supports multiple, comma-separated or multiple params)
 *
 * Returns:
 * - data: Array of requests with status, subject, requester, requested date, priority, business unit, last message
 * - counts: Counts for all 5 views (for sidebar display)
 * - total: Total number of requests in current view
 * - page: Current page
 * - perPage: Items per page
 *
 * Region Filtering (automatic on backend):
 * - Super admins and Admin role users see ALL requests
 * - Other users see only requests from their business_unit_region
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const view = searchParams.get("view") || "unassigned";
    const page = searchParams.get("page") || "1";
    const perPage = searchParams.get("perPage") || "20";

    // Get business unit IDs (supports multiple IDs via query params)
    const businessUnitIds = searchParams.getAll("business_unit_ids");

    // Validate view type
    const validViews = [
      // Existing views
      "unassigned",
      "all_unsolved",
      "my_unsolved",
      "recently_updated",
      "recently_solved",
      // New views
      "all_your_requests",
      "urgent_high_priority",
      "pending_requester_response",
      "pending_subtask",
      "new_today",
      "in_progress",
    ];

    if (!validViews.includes(view)) {
      return NextResponse.json(
        {
          error: "Invalid view type",
          detail: `View must be one of: ${validViews.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Build query string for backend
    const params = new URLSearchParams({
      view,
      page,
      per_page: perPage, // Backend uses snake_case
    });

    // Add business unit IDs if provided (send first one for now, backend only supports one)
    if (businessUnitIds.length > 0) {
      params.append("business_unit_id", businessUnitIds[0]);
    }

    const endpoint = `/requests/technician-views?${params.toString()}`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>("GET", endpoint);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get technician views error:", error);

    const apiError = error instanceof ApiError ? error : null;
    console.error("Error details:", {
      message: apiError?.message || "Unknown error",
      status: apiError?.status,
      statusText: apiError?.detail,
      data: apiError?.detail,
    });

    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve technician views",
        detail: message,
      },
      { status }
    );
  }
}
