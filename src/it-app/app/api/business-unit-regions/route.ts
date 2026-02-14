/**
 * Business Unit Regions API Route
 * Handles business unit region list and create operations
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/business-unit-regions - Get business unit regions list
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = `/business-unit-regions${searchParams ? `?${searchParams}` : ''}`;

    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get business unit regions error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve business unit regions", detail: message },
      { status }
    );
  }
}

/**
 * POST /api/business-unit-regions - Create new business unit region
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest("POST", "/business-unit-regions", body);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Create business unit region error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to create business unit region", detail: message },
      { status }
    );
  }
}
