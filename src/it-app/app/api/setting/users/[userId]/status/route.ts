import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * PUT /api/api/v1/users/[userId]/status
 * Toggles user active status
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await _request.json();

    const response = await makeAuthenticatedRequest(
      "PUT",
      `/users/${userId}/status`,
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
