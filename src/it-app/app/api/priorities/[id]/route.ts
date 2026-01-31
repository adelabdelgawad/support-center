/**
 * Priority by ID API Route
 * Handles fetching individual priority
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/priorities/[id] - Get priority by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/priorities/${id}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get priority ${await params.then(p => p.id)} error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ApiError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve priority",
        detail: message,
      },
      { status }
    );
  }
}
