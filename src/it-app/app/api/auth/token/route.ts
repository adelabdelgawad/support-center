import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/auth/token
 *
 * Returns the access token from httpOnly cookie for WebSocket authentication.
 * This is necessary because httpOnly cookies cannot be accessed from client JavaScript.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 401 }
      );
    }

    return NextResponse.json({ accessToken });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
