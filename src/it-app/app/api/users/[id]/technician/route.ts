/**
 * User Technician Status API Route
 * Handles updating user technician status
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * PUT /api/users/[id]/technician - Update user technician status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'PUT',
      `/users/${id}/technician`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Update user technician status error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to update user technician status",
        detail: message,
      },
      { status }
    );
  }
}
