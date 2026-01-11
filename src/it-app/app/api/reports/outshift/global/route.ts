import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const queryString = searchParams.toString();

  const data = await makeAuthenticatedRequest(
    "GET",
    `/reports/outshift/global${queryString ? `?${queryString}` : ""}`
  );

  return NextResponse.json(data);
}
