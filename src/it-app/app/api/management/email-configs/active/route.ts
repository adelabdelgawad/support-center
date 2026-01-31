/**
 * Active Email Configuration API Route
 *
 * GET /api/management/email-configs/active - Get the currently active email configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest<any>(
      "GET",
      "/email-configs/active"
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Failed to fetch active email config:", error);
    return NextResponse.json(
      { detail: error.message || "No active email configuration found" },
      { status: error.status || 404 }
    );
  }
}
