import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function POST(request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest<{
      createdCount: number;
      updatedCount: number;
      totalCount: number;
      devices: Array<{
        id: string;
        hostname: string;
        ipAddress: string | null;
        macAddress: string | null;
        lifecycleState: string;
        discoverySource: string;
        adComputerDn: string | null;
        lastSeenAt: string | null;
        hasActiveSession: boolean;
      }>;
      hostsScanned: number;
      hostsReachable: number;
      hostsDeployable: number;
    }>("POST", "/devices/refresh-status");

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error refreshing device status:", error);
    return NextResponse.json(
      { detail: error.message || "Failed to refresh device status" },
      { status: error.status || 500 }
    );
  }
}
