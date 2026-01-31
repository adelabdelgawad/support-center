import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/management/active-directory-configs
 * List all AD configurations
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skip = searchParams.get("skip") || "0";
    const limit = searchParams.get("limit") || "100";

    const response = await makeAuthenticatedRequest(
      "GET",
      `/active-directory-configs?skip=${skip}&limit=${limit}`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || "Failed to fetch AD configurations" },
      { status: error.status || 500 }
    );
  }
}

/**
 * POST /api/management/active-directory-configs
 * Create new AD configuration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest(
      "POST",
      "/active-directory-configs",
      body
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || "Failed to create AD configuration" },
      { status: error.status || 500 }
    );
  }
}
