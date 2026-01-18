import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/remote-access/request
 * Agent requests remote access for a service request
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: "Missing requestId" },
        { status: 400 }
      );
    }

    const response = await makeAuthenticatedRequest(
      "POST",
      `/requests/${requestId}/remote-access/request`
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error("Remote access request error:", error.message);

    return NextResponse.json(
      {
        error: error.message || "Failed to request remote access",
        detail: error.response?.data?.detail || error.response?.data
      },
      { status: error.status }
    );
  }
}
