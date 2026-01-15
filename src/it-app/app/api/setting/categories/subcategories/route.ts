import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/categories/subcategories
 * Fetches subcategories list by category ID
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("category_id");

    if (!categoryId) {
      return NextResponse.json(
        { detail: "category_id is required" },
        { status: 400 }
      );
    }

    const response = await makeAuthenticatedRequest(
      "GET",
      `/categories/subcategories?category_id=${categoryId}`
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
 * POST /api/setting/categories/subcategories
 * Creates a new subcategory
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest(
      "POST",
      "/categories/subcategories",
      body
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
