import { NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/api/v1/users/all_users
 * Fetches all users without pagination
 */
export async function GET() {
  try {
    const response = await makeAuthenticatedRequest(
      "GET",
      "/users/all_users/"
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
