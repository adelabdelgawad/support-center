/**
 * Priorities API Route
 * Fetches list of active priorities from Redis-cached backend endpoint
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend returns data from Redis cache (cache:priorities)
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/priorities - List all active priorities
 *
 * Returns cached list of priorities from backend.
 * Backend serves from Redis cache for optimal performance.
 *
 * Response format:
 * [
 *   {
 *     "id": 1,
 *     "name": "Critical",
 *     "responseTimeMinutes": 15,
 *     "resolutionTimeHours": 4
 *   }
 * ]
 */
export async function GET() {
  try {
    // Call backend API with authentication
    // Backend endpoint filters for active_only=true by default
    // Note: Trailing slash required by FastAPI router
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      '/priorities/'
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Get priorities error:", error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ApiError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve priorities",
        detail: message,
      },
      { status }
    );
  }
}
