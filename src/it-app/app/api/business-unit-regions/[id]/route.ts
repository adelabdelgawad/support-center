/**
 * Business Unit Region by ID API Route
 * Handles individual business unit region operations
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/business-unit-regions/[id] - Get business unit region by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await makeAuthenticatedRequest("GET", `/business-unit-regions/${id}`);
    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get business unit region error:`, error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve business unit region", detail: message },
      { status }
    );
  }
}
