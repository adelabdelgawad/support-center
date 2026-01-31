import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/management/active-directory-configs/active
 * Get the active AD configuration
 */
export async function GET(request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest(
      "GET",
      "/active-directory-configs/active"
    );

    return NextResponse.json(response);
  } catch (error: any) {
    // If 404, return null instead of error
    if (error.status === 404) {
      return NextResponse.json(null, { status: 200 });
    }

    return NextResponse.json(
      { detail: error.message || "Failed to fetch active AD configuration" },
      { status: error.status || 500 }
    );
  }
}
