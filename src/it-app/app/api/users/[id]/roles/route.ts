/**
 * User Roles API Route
 * Handles updating user roles
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * PUT /api/users/[id]/roles - Update user roles
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
      `/users/${id}/roles`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Update user roles error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to update user roles",
        detail: message,
      },
      { status }
    );
  }
}

/**
 * GET /api/users/[id]/roles - Get user roles
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
      `/users/${id}/roles`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get user roles error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve user roles",
        detail: message,
      },
      { status }
    );
  }
}
