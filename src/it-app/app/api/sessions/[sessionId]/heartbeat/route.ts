import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[sessionId]/heartbeat
 * Thin proxy to backend - triggers session heartbeat
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const session = await makeAuthenticatedRequest(
      'POST',
      `/sessions/${sessionId}/heartbeat`
    );

    return NextResponse.json(session);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to trigger heartbeat" },
      { status: error.status || 500 }
    );
  }
}
