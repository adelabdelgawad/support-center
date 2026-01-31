import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * POST /api/management/active-directory-configs/[id]/test
 * Test AD connection
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const response = await makeAuthenticatedRequest(
      "POST",
      `/active-directory-configs/${id}/test`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || "Failed to test AD connection" },
      { status: error.status || 500 }
    );
  }
}
