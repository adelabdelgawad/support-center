import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/remote-access/request
 * Agent requests remote access for a service request
 */
export async function POST(request: NextRequest) {
  console.log("[API Route] ========================================");
  console.log("[API Route] POST /api/remote-access/request");
  console.log("[API Route] ========================================");

  try {
    console.log("[API Route] Step 1: Parsing request body");
    const body = await request.json();
    console.log("[API Route] Request body:", body);

    const { requestId } = body;
    console.log("[API Route] Request ID:", requestId);

    if (!requestId) {
      console.error("[API Route] ❌ Missing requestId in request body");
      return NextResponse.json(
        { error: "Missing requestId" },
        { status: 400 }
      );
    }

    console.log("[API Route] Step 2: Calling backend");
    const backendUrl = `/requests/${requestId}/remote-access/request`;
    console.log("[API Route] Backend URL:", backendUrl);

    const response = await makeAuthenticatedRequest(
      "POST",
      backendUrl
    );

    console.log("[API Route] Step 3: Backend response received");
    console.log("[API Route] Response type:", typeof response);
    console.log("[API Route] Response:", JSON.stringify(response, null, 2));

    console.log("[API Route] ✅ Returning session to client");
    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error("[API Route] ❌❌❌ ERROR ❌❌❌");
    console.error("[API Route] Error type:", error.constructor?.name);
    console.error("[API Route] Error message:", error.message);
    console.error("[API Route] Error response status:", error.status);
    console.error("[API Route] Error response data:", error.response?.data);
    console.error("[API Route] Full error:", error);

    return NextResponse.json(
      {
        error: error.message || "Failed to request remote access",
        detail: error.response?.data?.detail || error.response?.data
      },
      { status: error.status }
    );
  }
}
