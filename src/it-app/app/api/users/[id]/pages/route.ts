/**
 * User Pages API Route
 * Fetches navigation pages for a specific user
 *
 * This is the client-accessible API route that proxies to the backend.
 * Used by the useNavigation hook for SWR-based fetching.
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";
import type { Page } from "@/types/pages";

/**
 * GET /api/users/[id]/pages - Get navigation pages for user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<Page[]>(
      'GET',
      `/users/${id}/pages`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Get user pages error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve user pages",
        detail: message,
      },
      { status }
    );
  }
}
