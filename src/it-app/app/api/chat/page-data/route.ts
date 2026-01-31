/**
 * Chat Page Data API Route
 * Provides aggregated data for the chat/ticket page
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend response returned to client
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/fetch/errors";
import {
  makeAuthenticatedRequest,
  getServerErrorMessage,
  getServerAccessToken,
} from "@/lib/api/server-fetch";
import type { ChatPageResponse } from "@/lib/types/chat-page";

/**
 * GET /api/chat/page-data - Get chat page aggregated data
 *
 * Returns:
 * - Request status counts with colors
 * - Chat message read/unread counts
 * - Chat message list with request details
 *
 * Query Parameters:
 * - statusFilter: Optional status ID to filter requests
 * - readFilter: Optional filter by read status ('read' or 'unread')
 */
export async function GET(request: NextRequest) {
  try {
    // Check if access token exists (long-lived, 30 days)
    const accessToken = await getServerAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          detail: "Authentication required. Please log in again.",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Build query string for backend
    const params: Record<string, string> = {};

    // Handle both camelCase and snake_case parameters for backward compatibility
    const statusFilter = searchParams.get("statusFilter") || searchParams.get("status_filter");
    const readFilter = searchParams.get("readFilter") || searchParams.get("read_filter");

    // Status mapping for API compatibility
    const STATUS_NAME_TO_ID: Record<string, number> = {
      pending: 1,    // Map "pending" to status ID 1
      approved: 2,   // Map "approved" to status ID 2
      rejected: 3,   // Map "rejected" to status ID 3
      completed: 4,  // Map "completed" to status ID 4
    };

    // Validate and convert statusFilter - backend expects integer IDs
    if (statusFilter !== null) {
      const statusValue = parseInt(statusFilter, 10);
      if (!isNaN(statusValue) && statusValue >= 0) {
        // Already a valid number, use as-is
        params.status_filter = statusValue.toString();
      } else {
        // Check if it's a string status name and convert to ID
        const statusId = STATUS_NAME_TO_ID[statusFilter];
        if (statusId !== undefined) {
          params.status_filter = statusId.toString();
        }
      }
    }

    // Validate readFilter - ensure it's a valid value
    if (readFilter !== null && (readFilter === "read" || readFilter === "unread")) {
      params.read_filter = readFilter;
    }

    // Convert params to query string
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString
      ? `/chat/page-data?${queryString}`
      : "/chat/page-data";

    // Call backend API with authentication
    // makeAuthenticatedRequest automatically includes the access token from httpOnly cookies
    const response = await makeAuthenticatedRequest<ChatPageResponse>(
      "GET",
      endpoint
    );

    return NextResponse.json(response);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    // If unauthorized, clear cookies
    if (status === 401) {
      const cookieStore = await cookies();
      cookieStore.delete("access_token");
      cookieStore.delete("session_id");
    }

    return NextResponse.json(
      {
        error: "Failed to retrieve chat page data",
        detail: message,
      },
      { status }
    );
  }
}
