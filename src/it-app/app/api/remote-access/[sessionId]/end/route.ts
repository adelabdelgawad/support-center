import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/remote-access/[sessionId]/end
 * End a remote access session
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const body = await request.json();
    const { reason = "Session ended" } = body;

    const response = await makeAuthenticatedRequest(
      "POST",
      `/remote-access/${sessionId}/end`,
      { reason }
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error ending session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to end session" },
      { status: error.status || 500 }
    );
  }
}
