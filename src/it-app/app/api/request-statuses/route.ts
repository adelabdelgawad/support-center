/**
 * Request Statuses API Route
 * Handles request status list and create operations
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/request-statuses - Get request statuses list
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = `/request-statuses${searchParams ? `?${searchParams}` : ''}`;

    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get request statuses error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve request statuses", detail: message },
      { status }
    );
  }
}

/**
 * POST /api/request-statuses - Create new request status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest("POST", "/request-statuses", body);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Create request status error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to create request status", detail: message },
      { status }
    );
  }
}
