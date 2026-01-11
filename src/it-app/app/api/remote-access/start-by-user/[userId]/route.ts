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
  console.log("[API Route] ========================================");
  console.log("[API Route] POST /api/remote-access/start-by-user");
  console.log("[API Route] ========================================");

  try {
    const { userId } = await params;
    console.log("[API Route] User ID:", userId);

    if (!userId) {
      console.error("[API Route] ❌ Missing userId in path");
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    console.log("[API Route] Calling backend: /remote-access/start-by-user/", userId);

    const response = await makeAuthenticatedRequest(
      "POST",
      `/remote-access/start-by-user/${userId}`
    );

    console.log("[API Route] ✅ Session created:", response);

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error("[API Route] ❌ Error:", error.message);
    console.error("[API Route] Error response:", error.response?.data);

    const status = error.status;
    const detail = error.response?.data?.detail || error.message || "Failed to start remote access";

    return NextResponse.json(
      { error: detail, detail },
      { status }
    );
  }
}
