import { NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export interface DomainUserSyncTaskResponse {
  taskId: string;
  status: string;
  message: string;
}

export async function POST() {
  try {
    const response = await makeAuthenticatedRequest<DomainUserSyncTaskResponse>(
      "POST",
      "/domain-users/sync"
    );

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Domain users sync API route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync domain users" },
      { status: error.status || 500 }
    );
  }
}
