/**
 * API Route: GET /api/auth/me
 *
 * Returns current user information based on access token cookie.
 * Used by server components to get user data during SSR.
 *
 * This endpoint:
 * 1. Reads access token from cookies
 * 2. Calls backend /api/v1/auth/me endpoint
 * 3. Returns user data with roles
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

interface UserResponse {
  id: string;  // UUID string
  username: string;
  fullName?: string;
  email?: string;
  isDomain?: boolean;
  isSuperAdmin?: boolean;
  isBlocked?: boolean;
  blockedMessage?: string;
  roles?: Array<{
    id: string;  // UUID string
    name: string;
    description?: string;
  }>;
}

/**
 * GET /api/auth/me
 *
 * Returns current user data by reading access token from cookies.
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

    // Call backend /api/v1/auth/me endpoint with access token
    // makeAuthenticatedRequest will use the access_token cookie automatically
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
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[me-route] Error:", errorMessage);

    // If backend returns 401/403/404, pass through the authentication failure
    // This ensures proper error handling on the client side
    if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          error: "authentication_failed",
          message: error.message || "Authentication failed",
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: "Failed to get user data",
      },
      { status: 500 }
    );
  }
}
