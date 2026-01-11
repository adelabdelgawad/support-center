import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextResponse } from "next/server";

/**
 * GET /api/sessions/stats
 * Thin proxy to backend - returns session statistics
 */
export async function GET() {
  try {
    const stats = await makeAuthenticatedRequest(
      'GET',
      '/sessions/stats'
    );

    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch session stats" },
      { status: error.status || 500 }
    );
  }
}
