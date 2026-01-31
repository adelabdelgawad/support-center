/**
 * Active Directory Login API Route
 * Handles username/password authentication via backend AD auth
 *
 * Backend returns camelCase fields (from HTTPSchemaModel),
 * but we convert back to snake_case for client consistency
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/fetch/errors";
import { makePublicRequest } from "@/lib/api/server-fetch";
import type { ADLoginRequest, LoginResponse, LoginResponseSnakeCase } from "@/lib/types/auth";

export async function POST(request: NextRequest) {
  try {
    const body: ADLoginRequest = await request.json();

    // Get client IP from headers
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0] : request.headers.get("x-real-ip") || "unknown";

    // Call backend AD login endpoint
    const data = await makePublicRequest<LoginResponse>('POST', '/auth/ad-login', {
      username: body.username,
      password: body.password,
      device_info: body.device_info,
      ip_address: ip,
    });

    // Backend returns camelCase (from HTTPSchemaModel)
    // Validate response data
    if (!data || !data.accessToken || !data.sessionId || !data.redirectTo) {
      console.error("Invalid backend response:", data);
      throw new Error("Invalid response from authentication server");
    }

    // Store tokens in httpOnly cookies
    const cookieStore = await cookies();

    // Check if refresh token present (only for users with refresh capability)
    const hasRefreshToken = !!data.refreshToken;

    // Determine if we should use secure cookies based on request protocol
    const isSecure = request.url.startsWith('https://');

    if (hasRefreshToken) {
      // TECHNICIAN USER: Short-lived tokens with refresh capability
      // Access token: 15 minutes - SECURITY FIX: httpOnly=true prevents XSS token theft
      cookieStore.set("access_token", data.accessToken, {
        httpOnly: true, // SECURITY: Token only accessible server-side
        secure: isSecure, // Only use secure flag on HTTPS
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60, // 15 minutes
      });

      // Refresh token: 7 days (only for technicians) - SECURITY FIX: httpOnly=true
      if (data.refreshToken) {
        cookieStore.set("refresh_token", data.refreshToken, {
          httpOnly: true, // SECURITY: Token only accessible server-side
          secure: isSecure, // Only use secure flag on HTTPS
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days
        });
      }

      // Store expiration time for quick client-side checks (non-sensitive)
      const expiresAt = Date.now() + (15 * 60 * 1000);
      cookieStore.set("access_token_expires", expiresAt.toString(), {
        httpOnly: false, // OK: expiration timestamp is not sensitive
        secure: isSecure, // Only use secure flag on HTTPS
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      });
    } else {
      // REGULAR USER: Long-lived tokens (30 days, no refresh)
      cookieStore.set("access_token", data.accessToken, {
        httpOnly: true, // SECURITY: Token only accessible server-side
        secure: isSecure, // Only use secure flag on HTTPS
        sameSite: "lax",
        path: "/",
        maxAge: data.expiresIn || 2592000, // 30 days in seconds
      });
    }

    // Store user data for ALL users (needed by layouts)
    cookieStore.set("user_data", JSON.stringify(data.user), {
      httpOnly: false, // Client needs to read user info for UI
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "lax",
      path: "/",
      maxAge: hasRefreshToken ? 15 * 60 : 2592000, // 15 min with refresh, 30 days without
    });

    // Session ID cookie (for tracking) - SECURITY FIX: httpOnly=true prevents session hijacking
    cookieStore.set("session_id", String(data.sessionId), {
      httpOnly: true, // SECURITY: Session ID only accessible server-side
      secure: isSecure, // Only use secure flag on HTTPS
      sameSite: "lax",
      path: "/",
      maxAge: hasRefreshToken ? 7 * 24 * 60 * 60 : 2592000, // 7 days with refresh, 30 days without
    });

    // Return user info and access token with backend redirect path
    const responseData: Record<string, unknown> = {
      access_token: data.accessToken,
      token_type: data.tokenType || "bearer",
      expires_in: hasRefreshToken ? 900 : (data.expiresIn || 2592000), // 15 minutes with refresh, 30 days without
      session_id: data.sessionId,
      redirect_to: data.redirectTo, // Backend-specified redirect path
      user: data.user,
    };

    // Include refresh token if present
    if (hasRefreshToken) {
      responseData.refresh_token = data.refreshToken;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    // Log full error for debugging
    console.error('[ad-login] Full error:', error);

    // Extract readable error information
    let status = 500;
    let detail = "An unexpected error occurred";

    if (error instanceof ApiError) {
      status = error.status;
      detail = error.message;

      console.error('[ad-login] ApiError:', {
        status,
        message: error.message,
      });

      // Handle connection errors
      if (error.status === 503 || error.status === 0) {
        detail = 'Cannot connect to authentication server';
      } else if (error.status === 408) {
        detail = 'Authentication server timeout';
      }
    } else if (error instanceof Error) {
      console.error('[ad-login] Error:', error.message, error.stack);
      detail = error.message;
    }

    // Return user-friendly error messages
    let userMessage = detail;
    if (status === 401) {
      userMessage = "Invalid username or password";
    } else if (status === 403) {
      userMessage = detail; // Keep backend message for blocked accounts etc.
    } else if (status === 404) {
      userMessage = "User not found";
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
