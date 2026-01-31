/**
 * Full Request Details API Route
 *
 * Proxies the combined backend endpoint that returns all ticket data in one call.
 * Reduces 6 separate API calls to 1, improving page load performance.
 *
 * Backend endpoint: GET /api/v1/requests/{id}/full-details
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import {
  makeAuthenticatedRequest,
  getServerErrorMessage,
} from "@/lib/api/server-fetch";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/requests-details/[id]/full-details
 *
 * Returns complete ticket data including:
 * - Ticket details with nested status, priority, requester
 * - Notes with creator info
 * - Assignees with user info
 * - Initial messages with sender info
 * - Sub-tasks
 * - Sub-task statistics
 * - Server timestamp
 *
 * Query params:
 * - messages_limit: Max messages to return (default 100)
 * - sub_tasks_limit: Max sub-tasks to return (default 20)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Invalid request ID format" },
        { status: 400 }
      );
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const messagesLimit = searchParams.get("messages_limit") || "100";
    const subTasksLimit = searchParams.get("sub_tasks_limit") || "20";

    // Call combined backend endpoint
    const response = await makeAuthenticatedRequest<unknown>(
      "GET",
      `/requests/${id}/full-details?messages_limit=${messagesLimit}&sub_tasks_limit=${subTasksLimit}`
    );

    return NextResponse.json(response);
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status =
      error instanceof ApiError ? error.status : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve request details",
        detail: message,
      },
      { status }
    );
  }
}
