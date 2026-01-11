import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/setting/business-unit-user-assigns/user/[userId]
 * Get all business units for a specific user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const userId = (await params).userId;

    const response = await makeAuthenticatedRequest<any>(
      "GET",
      `/business-unit-user-assigns/user/${userId}/business-units`
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching user business units:", error);
    return NextResponse.json(
      {
        detail: error.response?.data?.detail || "Failed to fetch user business units",
      },
      { status: error.status }
    );
  }
}
