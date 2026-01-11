import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/api/v1/roles/[roleId]/pages
 * Fetches pages for a specific role
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params;
    const searchParams = _request.nextUrl.searchParams;

    const response = await makeAuthenticatedRequest(
      "GET",
      `roles/${roleId}/pages?${searchParams.toString()}`
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
 * PUT /api/api/v1/roles/[roleId]/pages
 * Updates pages for a specific role
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params;
    const body = await _request.json();

    const response = await makeAuthenticatedRequest(
      "PUT",
      `roles/${roleId}/pages`,
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
