import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * PUT /api/api/v1/roles/[roleId]/status
 * Toggles role active status
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params;
    const searchParams = _request.nextUrl.searchParams;
    const _isActive = searchParams.get("is_active");

    const response = await makeAuthenticatedRequest(
      "PUT",
      `roles/${roleId}/status?is_active=${_isActive}`
    );

    return NextResponse.json(response);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
