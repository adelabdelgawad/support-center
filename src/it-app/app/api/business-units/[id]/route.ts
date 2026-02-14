/**
 * Business Unit by ID API Route
 * Handles individual business unit operations
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/business-units/[id] - Get business unit by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await makeAuthenticatedRequest("GET", `/business-units/${id}`);
    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get business unit error:`, error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve business unit", detail: message },
      { status }
    );
  }
}

/**
 * PUT /api/business-units/[id] - Update business unit
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await makeAuthenticatedRequest("PUT", `/business-units/${id}`, body);
    return NextResponse.json(response);
  } catch (error) {
    console.error(`Update business unit error:`, error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to update business unit", detail: message },
      { status }
    );
  }
}
