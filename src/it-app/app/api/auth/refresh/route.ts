/**
 * Token Refresh API Route (for Technician Users Only)
 *
 * Handles automatic token refresh for technician users who use
 * short-lived JWT access tokens (15 minutes) with refresh tokens (7 days).
 *
 * Regular users use long-lived access tokens (30 days) and don't need refresh.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { makePublicRequest, ServerFetchError, getServerErrorMessage } from "@/lib/api/server-fetch";

interface RefreshRequest {
  refresh_token: string;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: RefreshRequest = await request.json();

    if (!body.refresh_token) {
      return NextResponse.json(
        {
          error: "Invalid request",
          detail: "refresh_token is required",
        },
        { status: 400 }
      );
    }

    // Call backend token refresh endpoint
    const data = await makePublicRequest<RefreshResponse>('POST', '/auth/refresh', {
      refresh_token: body.refresh_token,
    });

    // Backend returns camelCase (from HTTPSchemaModel)
    if (!data || !data.accessToken || !data.refreshToken) {
      console.error("Invalid refresh response:", data);
      throw new Error("Invalid response from authentication server");
    }

    // Update cookies with new tokens
    const cookieStore = await cookies();

    // Determine if we should use secure cookies based on request protocol
    const isSecure = request.url.startsWith('https://');

    // Short-lived access token for technicians (15 minutes) - SECURITY FIX: httpOnly=true
    cookieStore.set("access_token", data.accessToken, {
      httpOnly: true, // SECURITY: Token only accessible server-side
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "strict",
      path: "/",
      maxAge: 15 * 60, // 15 minutes
    });

    // Refresh token (7 days) - SECURITY FIX: httpOnly=true
    cookieStore.set("refresh_token", data.refreshToken, {
      httpOnly: true, // SECURITY: Token only accessible server-side
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Store expiration time for quick client-side checks (non-sensitive)
    const expiresAt = Date.now() + (15 * 60 * 1000);
    cookieStore.set("access_token_expires", expiresAt.toString(), {
      httpOnly: false, // OK: expiration timestamp is not sensitive
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "strict",
      path: "/",
      maxAge: 15 * 60,
    });

    // Return new tokens
    return NextResponse.json({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenType: data.tokenType || "bearer",
      expiresIn: data.expiresIn || 900, // 15 minutes in seconds
    });
  } catch (error) {
    console.error("Token refresh error:", error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? error.status : 500;

    // Clear cookies on refresh failure
    const cookieStore = await cookies();
    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");
    cookieStore.delete("access_token_expires");
    cookieStore.delete("user_data");

    return NextResponse.json(
      {
        error: "Token refresh failed",
        detail: message,
      },
      { status }
    );
  }
}
