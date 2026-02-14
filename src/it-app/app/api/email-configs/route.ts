/**
 * API route for Email configurations
 * GET /api/email-configs - Get all email configurations
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { handleRouteError } from "@/lib/api/route-error-handler";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = `/email-configs${searchParams ? `?${searchParams}` : ""}`;
    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Fetch Email Configurations");
  }
}
