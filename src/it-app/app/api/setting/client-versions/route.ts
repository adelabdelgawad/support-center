import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import type { ClientVersion } from "@/types/client-versions";

/**
 * GET /api/setting/client-versions
 * List all client versions
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform") || undefined;
    const activeOnly = searchParams.get("active_only") !== "false";

    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    params.set("active_only", activeOnly.toString());

    const versions = await makeAuthenticatedRequest<ClientVersion[]>(
      "GET",
      `/client-versions?${params.toString()}`
    );

    // Calculate counts
    const total = versions.length;
    const latestCount = versions.filter(v => v.isLatest).length;
    const enforcedCount = versions.filter(v => v.isEnforced).length;

    return NextResponse.json({
      versions,
      total,
      latestCount,
      enforcedCount,
    });
  } catch (error) {
    console.error("Error fetching client versions:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to fetch versions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/setting/client-versions
 * Create a new client version (requires Admin role)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const version = await makeAuthenticatedRequest<ClientVersion>(
      "POST",
      "/client-versions",
      body
    );

    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    console.error("Error creating client version:", error);

    // Extract error message from API error
    const message = error instanceof Error ? error.message : "Failed to create version";

    // Check for common error patterns
    if (message.includes("401") || message.includes("Unauthorized")) {
      return NextResponse.json(
        { detail: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    if (message.includes("403") || message.includes("Forbidden") || message.includes("Admin")) {
      return NextResponse.json(
        { detail: "Admin role required to manage versions." },
        { status: 403 }
      );
    }

    // Pass through validation errors from backend
    return NextResponse.json(
      { detail: message },
      { status: 400 }
    );
  }
}
