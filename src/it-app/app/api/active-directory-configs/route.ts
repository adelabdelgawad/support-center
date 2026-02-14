/**
 * API route for Active Directory configurations
 * GET /api/active-directory-configs - Get all AD configurations
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { handleRouteError } from "@/lib/api/route-error-handler";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = `/active-directory-configs${searchParams ? `?${searchParams}` : ""}`;
    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Fetch Active Directory Configurations");
  }
}
