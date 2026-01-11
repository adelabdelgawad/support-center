/**
 * SignalR Token API Route
 *
 * Provides the access token for SignalR real-time connections.
 * This is needed because the access_token is stored in an httpOnly cookie
 * which JavaScript can't read directly, but SignalR connections need
 * the token for authentication.
 *
 * Flow:
 * 1. Client requests token from this endpoint
 * 2. Server reads access_token from httpOnly cookie
 * 3. Server returns token to client
 * 4. Client uses token to connect to SignalR hub
 *
 * Security:
 * - Only authenticated users can get their own token
 * - Token is transmitted over HTTPS
 * - This doesn't weaken security - the token is already accessible to the browser
 *   (via localStorage after login), we're just providing an alternative access method
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Not authenticated",
          detail: "No access token found. Please log in.",
        },
        { status: 401 }
      );
    }

    // Return the token for SignalR use
    return NextResponse.json({
      access_token: accessToken,
      token_type: "bearer",
    });
  } catch (error) {
    console.error("[signalr-token] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to get token",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
