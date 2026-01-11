import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export interface DomainUserSyncStatusResponse {
  success: boolean;
  message: string;
  syncedCount: number;
  syncTimestamp: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    const response = await makeAuthenticatedRequest<DomainUserSyncStatusResponse>(
      "GET",
      `/domain-users/sync/status/${taskId}`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Domain users sync status API route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get sync status" },
      { status: error.status || 500 }
    );
  }
}
