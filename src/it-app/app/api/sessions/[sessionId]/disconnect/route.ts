import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

/**
 * POST /api/sessions/[sessionId]/disconnect
 * Disconnect a desktop session (mark as inactive and optionally force disconnect)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json().catch(() => ({}));
    const force = body.force ?? true; // Default to force disconnect when called from UI

    // Call backend to disconnect the session with force parameter
    const response = await makeAuthenticatedRequest(
      'POST',
      `/sessions/desktop/${sessionId}/disconnect?force=${force}`
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    console.error('Failed to disconnect session:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { detail: 'Failed to disconnect session' },
      { status: 500 }
    );
  }
}
