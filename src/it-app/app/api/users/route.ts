/**
 * Users API Route
 * Handles user list and create operations
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/users - Get users list
 *
 * Query Parameters:
 * - is_technician: Filter by technician status
 * - skip: Number of records to skip
 * - limit: Maximum number of records to return
 * - search: Search term
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = `/users${searchParams ? `?${searchParams}` : ''}`;

    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Get users error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to retrieve users", detail: message },
      { status }
    );
  }
}

/**
 * POST /api/users - Create new user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest("POST", "/users", body);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Create user error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      { error: "Failed to create user", detail: message },
      { status }
    );
  }
}
