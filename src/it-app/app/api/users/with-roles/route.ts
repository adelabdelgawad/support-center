/**
 * Users with Roles API Route
 * Fetches users with their role information
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/users/with-roles - Get users with roles
 */
export async function GET(request: NextRequest) {
  try {
    // Forward all query parameters to the backend
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    // Debug logging (remove in production)
    console.log('[API Route] Users with roles - Query params:', queryString);

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/users/with-roles/?${queryString}`
    );

    console.log('[API Route] Users with roles - Response count:', (response as any)?.total || 0);

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get users with roles error:`, error);

    const message = getServerErrorMessage(error);

    // Extract status from enhanced error or API error
    let status = 500;
    if (error instanceof ServerFetchError) {
      status = error.status;
    } else if (error && typeof error === 'object' && 'status' in error) {
      status = (error as { status: number }).status || 500;
    }

    return NextResponse.json(
      {
        error: status === 401 ? "Authentication required" : "Failed to retrieve users",
        detail: message,
      },
      { status }
    );
  }
}
