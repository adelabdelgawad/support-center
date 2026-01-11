/**
 * Bulk User Status API Route
 * Handles bulk updating user activation status
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * POST /api/users/bulk-status - Bulk update user status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'POST',
      `/users/bulk-status`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Bulk update user status error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to bulk update user status",
        detail: message,
      },
      { status }
    );
  }
}
