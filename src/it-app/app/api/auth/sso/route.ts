/**
 * SSO Login API Route
 * Handles passwordless SSO authentication (username only)
 *
 * Backend returns camelCase fields (from HTTPSchemaModel),
 * but we convert back to snake_case for client consistency
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/fetch/errors";
import { makePublicRequest } from "@/lib/api/server-fetch";
import type { SSOLoginRequest, LoginResponse, LoginResponseSnakeCase } from "@/lib/types/auth";

export async function POST(request: NextRequest) {
  try {
    const body: SSOLoginRequest = await request.json();

    // Get client IP from headers
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0] : request.headers.get("x-real-ip") || "unknown";

    // Call backend SSO login endpoint
    const data = await makePublicRequest<LoginResponse>('POST', '/auth/sso-login', {
      username: body.username,
      device_info: body.device_info,
      ip_address: ip,
    });

    // Backend returns camelCase (from HTTPSchemaModel)
    // Validate response data
    if (!data || !data.accessToken || !data.sessionId || !data.redirectTo) {
      console.error("Invalid backend response:", data);
      throw new Error("Invalid response from authentication server");
    }

    // NOTE: Role checking removed - backend enforces access control
    // If user shouldn't have SSO access, backend will return 403

    // Set long-lived access token in httpOnly cookie for security (30 days)
    const cookieStore = await cookies();

    // Determine if we should use secure cookies based on request protocol
    const isSecure = request.url.startsWith('https://');

    // Long-lived access token cookie (30 days)
    cookieStore.set("access_token", data.accessToken, {
      httpOnly: true,
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "lax",
      path: "/",
      maxAge: data.expiresIn || 2592000, // 30 days in seconds
    });

    // Store user data (needed by layouts)
    cookieStore.set("user_data", JSON.stringify(data.user), {
      httpOnly: false, // Client needs to read user info for UI
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "lax",
      path: "/",
      maxAge: 2592000, // 30 days in seconds
    });

    // Session ID cookie (for tracking, 30 days)
    cookieStore.set("session_id", String(data.sessionId), {
      httpOnly: false, // Allow client to read session ID
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "lax",
      path: "/",
      maxAge: 2592000, // 30 days in seconds
    });

    // Return user info and access token with backend redirect path
    return NextResponse.json({
      access_token: data.accessToken,
      token_type: data.tokenType || "bearer",
      expires_in: data.expiresIn || 2592000,
      session_id: data.sessionId,
      redirect_to: data.redirectTo, // Backend-specified redirect path
      user: data.user,
    });
  } catch (error) {
    // Extract readable error information
    let status = 500;
    let detail = "An unexpected error occurred";

    if (error instanceof ApiError) {
      status = error.status;
      detail = error.message;

      // Log readable error info
      console.error("SSO login error:", {
        status,
        detail,
        url: error.url,
      });
    } else if (error instanceof Error) {
      detail = error.message;
      console.error("SSO login error:", { message: error.message });
    } else {
      console.error("SSO login error:", { error });
    }

    // Return user-friendly error messages
    let userMessage = detail;
    if (status === 401) {
      userMessage = "Authentication failed. Please try again.";
    } else if (status === 404) {
      userMessage = "User not found in system";
    } else if (status >= 500) {
      userMessage = "Server error. Please try again later.";
    }

    return NextResponse.json(
      {
        error: "Authentication failed",
        detail: userMessage,
      },
      { status }
    );
  }
}
