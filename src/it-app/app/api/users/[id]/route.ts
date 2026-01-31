/**
 * User by ID API Route
 * Handles fetching individual user
 */
import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";
import { ApiError } from "@/lib/fetch/errors";

/**
 * GET /api/users/[id] - Get user by ID
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
      `/users/${id}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get user ${await params.then(p => p.id)} error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ApiError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve user",
        detail: message,
      },
      { status }
    );
  }
}
