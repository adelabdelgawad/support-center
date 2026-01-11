import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/api/v1/roles
 * Fetches roles with pagination, filtering, and sorting
 */
export async function GET(_request: NextRequest) {
  try {
    // Forward all query parameters to the backend
    const searchParams = _request.nextUrl.searchParams;

    const response = await makeAuthenticatedRequest(
      "GET",
      `roles/?${searchParams.toString()}`
    );

    return NextResponse.json(response);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}

/**
 * POST /api/api/v1/roles
 * Creates a new role
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();

    const response = await makeAuthenticatedRequest(
      "POST",
      "roles/",
      body
    );

    return NextResponse.json(response);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
