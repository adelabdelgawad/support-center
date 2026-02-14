/**
 * Business Units API Route
 * Handles business unit list and create operations
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/business-units - Get business units list
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = `/business-units${searchParams ? `?${searchParams}` : ''}`;

    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get business units error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve business units", detail: message },
      { status }
    );
  }
}

/**
 * POST /api/business-units - Create new business unit
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest("POST", "/business-units", body);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Create business unit error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to create business unit", detail: message },
      { status }
    );
  }
}
