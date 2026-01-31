/**
 * Bulk User Technician Status API Route
 * Handles bulk updating user technician status
 */
import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";
import { ApiError } from "@/lib/fetch/errors";

/**
 * POST /api/users/bulk-technician - Bulk update user technician status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'POST',
      `/users/bulk-technician`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Bulk update user technician status error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ApiError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to bulk update user technician status",
        detail: message,
      },
      { status }
    );
  }
}
