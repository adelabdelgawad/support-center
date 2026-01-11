import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

interface RouteContext {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { sessionId } = await context.params;

    const session = await makeAuthenticatedRequest<{
      id: string;
      status: string;
    }>("GET", `/remote-access/${sessionId}`);

    return NextResponse.json({ status: session.status }, { status: 200 });
  } catch (error: any) {
    console.error("[API] Error fetching remote access session status:", error);

    return NextResponse.json(
      {
        error: error.response?.data?.detail || "Failed to fetch session status",
      },
      { status: error.status }
    );
  }
}
