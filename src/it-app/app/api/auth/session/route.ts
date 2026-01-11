/**
 * API Route: GET /api/auth/session
 *
 * Returns current session information (same as /api/auth/me).
 * Used by ClientAppWrapper's refresh() function to revalidate session.
 *
 * This is a convenience alias to /api/auth/me for compatibility with
 * different naming conventions (session vs me).
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

interface UserResponse {
  id: number;
  username: string;
  fullName?: string;
  email?: string;
  isDomain?: boolean;
  isSuperAdmin?: boolean;
  isBlocked?: boolean;
  blockedMessage?: string;
  roles?: Array<{
    id: number;
    name: string;
    description?: string;
  }>;
}

/**
 * GET /api/auth/session
 *
 * Returns current user data - alias for /api/auth/me.
 */
export async function GET(request: NextRequest) {
  try {
    // Get access token from cookies
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "no_token", message: "No access token found" },
        { status: 401 }
      );
    }

    // Call backend /api/v1/auth/me endpoint
    const userData = await makeAuthenticatedRequest<UserResponse>(
      "GET",
      "/auth/me"  // baseURL already includes /api/v1
    );

    // Return user data
    return NextResponse.json(
      {
        ok: true,
        user: userData,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: "Failed to get session data",
      },
      { status: 500 }
    );
  }
}
