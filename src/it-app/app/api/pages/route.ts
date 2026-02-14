/**
 * Pages API Route
 * Handles pages list
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/pages - Get pages list
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = `/pages${searchParams ? `?${searchParams}` : ''}`;

    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get pages error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve pages", detail: message },
      { status }
    );
  }
}
