import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/remote-access/start-by-user/[userId]
 * Start remote access directly by user ID (from Active Sessions)
 *
 * This endpoint is used when initiating remote access from the Active Sessions
 * management page. It finds the user's most recent open request (if any) and
 * starts remote access. If user has no open requests, starts a direct session.
 */
export async function POST(
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

    const response = await makeAuthenticatedRequest(
      "POST",
      `/remote-access/start-by-user/${userId}`
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error("Remote access start-by-user error:", error.message);

    const status = error.status;
    const detail = error.response?.data?.detail || error.message || "Failed to start remote access";

    return NextResponse.json(
      { error: detail, detail },
      { status }
    );
  }
}
