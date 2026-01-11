import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/setting/business-unit-user-assigns/business-unit/[businessUnitId]
 * Get all users for a specific business unit
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessUnitId: string }> }
) {
  try {
    const businessUnitId = (await params).businessUnitId;

    const response = await makeAuthenticatedRequest<any>(
      "GET",
      `/business-unit-user-assigns/business-unit/${businessUnitId}/users`
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching business unit users:", error);
    return NextResponse.json(
      {
        detail: error.response?.data?.detail || "Failed to fetch business unit users",
      },
      { status: error.status }
    );
  }
}
