import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/remote-access/[sessionId]
 * Get remote access session details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const response = await makeAuthenticatedRequest(
      "GET",
      `/remote-access/${sessionId}`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error fetching session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch session" },
      { status: error.status }
    );
  }
}

/**
 * POST /api/remote-access/[sessionId] - Handle session actions
 *
 * EPHEMERAL SESSIONS: Only "resume" action is supported.
 * All other session management (control mode, ending session) is handled via WebSocket only.
 *
 * Actions:
 * - resume: Reconnect to an existing session after disconnection
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await request.json();
  const { action, ...data } = body;

  try {
    if (action === "resume") {
      // Resume/reconnect to an existing session
      const response = await makeAuthenticatedRequest(
        "POST",
        `/remote-access/${sessionId}/resume`,
        data
      );
      return NextResponse.json(response);
    }

    // All other actions no longer supported in ephemeral model
    return NextResponse.json(
      { error: `Action '${action}' not supported. Use WebSocket for session management.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error(`Error performing action ${action}:`, error);
    return NextResponse.json(
      { error: error.message || `Failed to ${action}` },
      { status: error.status }
    );
  }
}
