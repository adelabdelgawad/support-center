import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const data = await makeAuthenticatedRequest(
      "GET",
      `/sla-configs/${queryString ? `?${queryString}` : ""}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching SLA configs:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch SLA configs";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const data = await makeAuthenticatedRequest(
      "POST",
      "/sla-configs/",
      body
    );

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error creating SLA config:", error);
    const message = error instanceof Error ? error.message : "Failed to create SLA config";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}
