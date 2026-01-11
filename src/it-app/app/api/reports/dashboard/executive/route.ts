import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    // Forward query parameters to backend
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const data = await makeAuthenticatedRequest(
      "GET",
      `/reports/dashboard/executive${queryString ? `?${queryString}` : ""}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching executive dashboard:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}
