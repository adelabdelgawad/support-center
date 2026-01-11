import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

/**
 * POST /api/sessions/[sessionId]/push-update
 * Push update notification to a desktop session to trigger client upgrade
 * The client will receive a WebSocket message to download and install the latest version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Call backend to push update notification to the session
    const response = await makeAuthenticatedRequest<{
      success: boolean;
      sessionId: number;
      userId: string;
      targetVersion: string;
      message: string;
    }>(
      'POST',
      `/sessions/desktop/${sessionId}/push-update`
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    console.error('Failed to push update to session:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { detail: 'Failed to push update to session' },
      { status: 500 }
    );
  }
}
