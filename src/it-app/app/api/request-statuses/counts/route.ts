/**
 * Request Statuses Counts API Route
 * Handles request status counts
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/request-statuses/counts - Get request status counts
 */
export async function GET(_request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest("GET", "/request-statuses/counts");
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get request status counts error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve request status counts", detail: message },
      { status }
    );
  }
}
