import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/desktop-sessions/user/[userId]
 *
 * Get all active desktop sessions for a specific user.
 * Used to show available sessions for remote access selection.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    const sessions = await makeAuthenticatedRequest(
      "GET",
      `/sessions/desktop/user/${userId}?active_only=true`
    ) as any[];

    return NextResponse.json(sessions);
  } catch (error: any) {

    const status = error.status || 500;
    const detail = error.response?.data?.detail || error.message || "Failed to fetch user sessions";

    return NextResponse.json(
      { error: detail, detail },
      { status }
    );
  }
}
