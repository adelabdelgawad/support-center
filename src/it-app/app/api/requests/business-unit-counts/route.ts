/**
 * Business Unit Counts API Route
 * Fetches ticket counts grouped by business unit
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import {
  makeAuthenticatedRequest,
  getServerErrorMessage,
} from "@/lib/api/server-fetch";

interface BusinessUnitCount {
  id: number;
  name: string;
  count: number;
}

interface BusinessUnitCountsResponse {
  businessUnits: BusinessUnitCount[];
  total: number;
  unassignedCount: number;
}

/**
 * GET /api/requests/business-unit-counts - Get ticket counts by business unit
 *
 * Query Parameters:
 * - view: Optional view filter (e.g., 'all_unsolved', 'unassigned', 'my_unsolved')
 *
 * Returns:
 * - businessUnits: Array of business units with ticket counts
 * - total: Total ticket count
 * - unassignedCount: Count of requests without a business unit
 *
 * Region Filtering (automatic on backend):
 * - Super admins and Admin role users see ALL business units
 * - Other users see only business units from their assigned regions
 */
export async function GET(request: NextRequest) {
  try {
    // Get view parameter from query string
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    // Build backend URL with optional view parameter
    const backendUrl = view
      ? `/requests/business-unit-counts?view=${encodeURIComponent(view)}`
      : "/requests/business-unit-counts";

    const response = await makeAuthenticatedRequest<BusinessUnitCountsResponse>(
      "GET",
      backendUrl
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get business unit counts error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve business unit counts",
        detail: message,
      },
      { status }
    );
  }
}
