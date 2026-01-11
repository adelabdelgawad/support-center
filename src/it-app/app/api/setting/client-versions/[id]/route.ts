import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import type { ClientVersion } from "@/types/client-versions";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/setting/client-versions/[id]
 * Get a single client version
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const version = await makeAuthenticatedRequest<ClientVersion>(
      "GET",
      `/client-versions/${id}`
    );

    return NextResponse.json(version);
  } catch (error) {
    console.error("Error fetching client version:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to fetch version" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/setting/client-versions/[id]
 * Update a client version
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const version = await makeAuthenticatedRequest<ClientVersion>(
      "PUT",
      `/client-versions/${id}`,
      body
    );

    return NextResponse.json(version);
  } catch (error) {
    console.error("Error updating client version:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to update version" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/setting/client-versions/[id]
 * Delete/deactivate a client version
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get("hard_delete") === "true";

    await makeAuthenticatedRequest(
      "DELETE",
      `/client-versions/${id}?hard_delete=${hardDelete}`
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting client version:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to delete version" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/setting/client-versions/[id]
 * Set version as latest (route: set-latest)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "set-latest") {
      const version = await makeAuthenticatedRequest<ClientVersion>(
        "POST",
        `/client-versions/${id}/set-latest`
      );
      return NextResponse.json(version);
    }

    return NextResponse.json(
      { detail: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error performing action on client version:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to perform action" },
      { status: 500 }
    );
  }
}
