/**
 * Logout API Route
 * Terminates user session and clears authentication cookies
 * Also invalidates user-specific Next.js caches
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import type { LogoutResponse } from "@/lib/types/auth";
import { getServerErrorMessage, getServerUserInfo, makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function POST(request: NextRequest) {
  try {
    // Get user info before logout for cache invalidation
    const userInfo = await getServerUserInfo();

    try {
      // Call backend logout endpoint to invalidate session
      await makeAuthenticatedRequest<LogoutResponse>("POST", "/auth/logout", {});
    } catch (error) {
      // Continue even if backend logout fails (e.g., token already invalid)
      console.warn("Backend logout failed (continuing anyway):", getServerErrorMessage(error));
    }

    // Invalidate user-specific Next.js caches
    // This ensures the user's cached data is cleared on logout
    // Note: revalidateTag in Next.js 16+ requires a second argument (profile or expire config)
    if (userInfo?.id) {
      try {
        revalidateTag(`user-pages:${userInfo.id}`, {});
        revalidateTag(`user-profile:${userInfo.id}`, {});
      } catch (error) {
        // Cache invalidation is best-effort, don't fail logout
        console.warn("Cache invalidation failed:", error);
      }
    }

    // Clear ALL authentication cookies
    const cookieStore = await cookies();
    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");
    cookieStore.delete("session_id");
    cookieStore.delete("user_data");
    cookieStore.delete("access_token_expires");

    return NextResponse.json({
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);

    // Still clear ALL cookies even if there's an error
    const cookieStore = await cookies();
    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");
    cookieStore.delete("session_id");
    cookieStore.delete("user_data");
    cookieStore.delete("access_token_expires");

    const message = getServerErrorMessage(error);

    return NextResponse.json(
      {
        error: "Logout failed",
        detail: message,
      },
      { status: 500 }
    );
  }
}
