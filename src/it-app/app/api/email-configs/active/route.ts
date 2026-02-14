/**
 * API route for getting active Email configuration
 * GET /api/email-configs/active - Get the active email configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { handleRouteError } from "@/lib/api/route-error-handler";

export async function GET(request: NextRequest) {
  try {
    const endpoint = "/email-configs/active";
    const response = await makeAuthenticatedRequest("GET", endpoint);
    return NextResponse.json(response);
  } catch (error) {
    return handleRouteError(error, "Fetch Active Email Configuration");
  }
}
