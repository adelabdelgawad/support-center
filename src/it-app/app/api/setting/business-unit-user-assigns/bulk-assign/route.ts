import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/setting/business-unit-user-assigns/bulk-assign
 * Bulk assign users to a business unit
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest<any>(
      "POST",
      "/business-unit-user-assigns/bulk-assign",
      body
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error("Error bulk assigning users:", error);
    return NextResponse.json(
      {
        detail: error.response?.data?.detail || "Failed to bulk assign users",
      },
      { status: error.status }
    );
  }
}
