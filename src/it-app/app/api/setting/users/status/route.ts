import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/api/v1/users/status
 * Updates status for multiple users (bulk operation)
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();

    const response = await makeAuthenticatedRequest(
      "POST",
      "/users/status",
      body
    );

    return NextResponse.json(response);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    return NextResponse.json(
      { detail: enhancedError.detail || getServerErrorMessage(error) },
      { status: enhancedError.status || 500 }
    );
  }
}
