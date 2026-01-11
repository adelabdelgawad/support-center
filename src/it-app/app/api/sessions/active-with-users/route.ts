import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextResponse } from "next/server";

/**
 * GET /api/sessions/active-with-users
 * Thin proxy to backend - returns active desktop sessions with user info
 */
export async function GET() {
  try {
    const sessions = await makeAuthenticatedRequest(
      'GET',
      '/sessions/desktop/active-with-users'
    );

    return NextResponse.json(sessions);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch active sessions" },
      { status: error.status || 500 }
    );
  }
}
