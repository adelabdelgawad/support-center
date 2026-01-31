/**
 * Sub-tasks API Route
 * Handles fetching and creating sub-tasks for a parent request
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend response returned to client
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import {
  makeAuthenticatedRequest,
  getServerErrorMessage,
} from "@/lib/api/server-fetch";

/**
 * GET /api/requests/[id]/sub-tasks - Get all sub-tasks for a parent request
 *
 * Query Parameters:
 * - skip: Number of records to skip (pagination)
 * - limit: Maximum number of records to return
 *
 * Returns:
 * - Array of ServiceRequest objects (sub-tasks)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const skip = searchParams.get("skip") || "0";
    const limit = searchParams.get("limit") || "20";

    // Build query string for backend
    const queryParams = new URLSearchParams({
      skip,
      limit,
    });

    const endpoint = `/requests/${id}/sub-tasks?${queryParams.toString()}`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>("GET", endpoint);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Get sub-tasks error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve sub-tasks",
        detail: message,
      },
      { status }
    );
  }
}

/**
 * POST /api/requests/[id]/sub-tasks - Create a new sub-task
 *
 * Body:
 * - title: Sub-task title
 * - description: Sub-task description
 * - priority_id: Priority ID
 * - status_id: Status ID
 * - etc.
 *
 * Returns:
 * - Created ServiceRequest object (sub-task)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Parse JSON body safely
    let body;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch (parseError) {
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
          detail: "Request body must be valid JSON",
        },
        { status: 400 }
      );
    }

    const endpoint = `/requests/${id}/sub-tasks`;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      "POST",
      endpoint,
      body
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Create sub-task error:", error);

    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to create sub-task",
        detail: message,
      },
      { status }
    );
  }
}
