import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const data = await makeAuthenticatedRequest(
      "GET",
      `/reports/volume/analysis${queryString ? `?${queryString}` : ""}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching volume analysis report:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch report";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}
