import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/management/active-directory-configs/[id]
 * Get AD configuration by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const response = await makeAuthenticatedRequest(
      "GET",
      `/active-directory-configs/${id}`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || "Failed to fetch AD configuration" },
      { status: error.status || 500 }
    );
  }
}

/**
 * PUT /api/management/active-directory-configs/[id]
 * Update AD configuration
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await makeAuthenticatedRequest(
      "PUT",
      `/active-directory-configs/${id}`,
      body
    );

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || "Failed to update AD configuration" },
      { status: error.status || 500 }
    );
  }
}

/**
 * DELETE /api/management/active-directory-configs/[id]
 * Delete AD configuration
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    await makeAuthenticatedRequest(
      "DELETE",
      `/active-directory-configs/${id}`
    );

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || "Failed to delete AD configuration" },
      { status: error.status || 500 }
    );
  }
}
