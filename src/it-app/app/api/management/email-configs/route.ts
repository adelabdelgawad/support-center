/**
 * Email Configurations API Route
 *
 * GET  /api/management/email-configs - List all email configurations
 * POST /api/management/email-configs - Create new email configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skip = searchParams.get("skip") || "0";
    const limit = searchParams.get("limit") || "100";

    const response = await makeAuthenticatedRequest<any>(
      "GET",
      `/email-configs?skip=${skip}&limit=${limit}`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Failed to fetch email configs:", error);
    return NextResponse.json(
      { detail: error.message || "Failed to fetch email configurations" },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest<any>(
      "POST",
      "/email-configs",
      body
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create email config:", error);
    return NextResponse.json(
      { detail: error.message || "Failed to create email configuration" },
      { status: error.status || 400 }
    );
  }
}
