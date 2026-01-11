import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const data = await makeAuthenticatedRequest(
      "GET",
      `/reports/sla/compliance${queryString ? `?${queryString}` : ""}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching SLA compliance report:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch report";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}
