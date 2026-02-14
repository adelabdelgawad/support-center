/**
 * API route for getting active Active Directory configuration
 * GET /api/active-directory-configs/active - Get the active AD configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { handleRouteError } from "@/lib/api/route-error-handler";

export async function GET(request: NextRequest) {
  try {
    const endpoint = "/active-directory-configs/active";
    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Fetch Active Active Directory Configuration");
  }
}
