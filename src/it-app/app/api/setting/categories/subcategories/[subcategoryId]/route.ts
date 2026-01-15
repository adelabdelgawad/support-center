import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/categories/subcategories/[subcategoryId]
 * Gets a single subcategory by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ subcategoryId: string }> }
) {
  const { subcategoryId } = await params;
  try {
    const response = await makeAuthenticatedRequest(
      "GET",
      `/categories/subcategories/${subcategoryId}`
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
 * PUT /api/setting/categories/subcategories/[subcategoryId]
 * Updates an existing subcategory
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ subcategoryId: string }> }
) {
  const { subcategoryId } = await params;
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest(
      "PUT",
      `/categories/subcategories/${subcategoryId}`,
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

/**
 * DELETE /api/setting/categories/subcategories/[subcategoryId]
 * Soft deletes a subcategory (marks as inactive)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ subcategoryId: string }> }
) {
  const { subcategoryId } = await params;
  try {
    await makeAuthenticatedRequest(
      "DELETE",
      `/categories/subcategories/${subcategoryId}`
    );

    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
