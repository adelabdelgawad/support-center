/**
 * User Sections API Route
 * Handles updating user sections
 */
import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * POST /api/users/[id]/sections - Set user sections
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Call backend API with authentication
    // Backend endpoint: POST /user-sections/{user_id}/sections
    const response = await makeAuthenticatedRequest<unknown>(
      "POST",
      `/user-sections/${id}/sections`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Set user sections error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof Error && "status" in error ? (error as any).status : 500;

    return NextResponse.json(
      {
        error: "Failed to update user sections",
        detail: message,
      },
      { status }
    );
  }
}

/**
 * GET /api/users/[id]/sections - Get user sections
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Call backend API with authentication
    // Backend endpoint: GET /user-sections/{user_id}/sections
    const response = await makeAuthenticatedRequest<unknown>(
      "GET",
      `/user-sections/${id}/sections`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get user sections error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof Error && "status" in error ? (error as any).status : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve user sections",
        detail: message,
      },
      { status }
    );
  }
}
