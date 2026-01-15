import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * PUT /api/setting/categories/[categoryId]/status
 * Toggles category active status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const { categoryId } = await params;
  try {
    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get("is_active") === "true";

    // Update category with new status
    const response = await makeAuthenticatedRequest(
      "PUT",
      `/categories/categories/${categoryId}`,
      { is_active: isActive }
    );

    return NextResponse.json(response);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
