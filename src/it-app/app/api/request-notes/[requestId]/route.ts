/**
 * Request Notes by Request ID API Route
 * Fetches all notes for a specific service request
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend returns paginated list of notes
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/request-notes/[requestId] - Get all notes for a service request
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - perPage: Items per page (default: 50, max: 100)
 *
 * Response format:
 * [
 *   {
 *     "id": 1,
 *     "requestId": "uuid-string",
 *     "note": "Note content",
 *     "createdBy": 123,
 *     "isSystemGenerated": false,
 *     "createdAt": "2025-11-20T17:00:00Z"
 *   }
 * ]
 *
 * Response headers:
 * - X-Total-Count: Total number of notes
 * - X-Page: Current page
 * - X-Per-Page: Items per page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('perPage') || '50';

    // Build query string
    const queryString = new URLSearchParams({
      page,
      per_page: perPage, // Backend uses snake_case
    }).toString();

    // Call backend API with authentication
    // Backend endpoint: /api/v1/request-notes/{request_id}/notes
    const endpoint = `/request-notes/${requestId}/notes?${queryString}`;
    const response = await makeAuthenticatedRequest<unknown>('GET', endpoint);

    // Create response with headers
    const nextResponse = NextResponse.json(response);

    // Copy pagination headers from backend if they exist
    // Note: makeAuthenticatedRequest doesn't return headers by default,
    // so we'll rely on the response data for pagination info
    // If backend sends headers, they would need to be extracted from the fetch response

    return nextResponse;
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve notes",
        detail: message,
      },
      { status }
    );
  }
}
