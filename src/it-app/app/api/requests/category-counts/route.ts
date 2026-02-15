/**
 * Category Counts API Route
 * Fetches ticket counts grouped by category
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import {
  makeAuthenticatedRequest,
  getServerErrorMessage,
} from "@/lib/api/server-fetch";

interface CategoryCount {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  count: number;
}

interface CategoryCountsResponse {
  categories: CategoryCount[];
  total: number;
}

/**
 * GET /api/requests/category-counts - Get ticket counts by category
 *
 * Query Parameters:
 * - view: Optional view filter (e.g., 'all_unsolved', 'unassigned', 'my_unsolved')
 *
 * Returns:
 * - categories: Array of categories with ticket counts
 * - total: Total ticket count
 *
 * Region Filtering (automatic on backend):
 * - Respects user's section-based visibility filtering
 */
export async function GET(request: NextRequest) {
  try {
    // Get view parameter from query string
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    // Build backend URL with optional view parameter
    const backendUrl = view
      ? `/requests/category-counts?view=${encodeURIComponent(view)}`
      : "/requests/category-counts";

    const response = await makeAuthenticatedRequest<CategoryCountsResponse>(
      "GET",
      backendUrl
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get category counts error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve category counts",
        detail: message,
      },
      { status }
    );
  }
}
