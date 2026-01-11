import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await makeAuthenticatedRequest("GET", `/report-configs/${id}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching report config:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch report config";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data = await makeAuthenticatedRequest(
      "PATCH",
      `/report-configs/${id}`,
      body
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating report config:", error);
    const message = error instanceof Error ? error.message : "Failed to update report config";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await makeAuthenticatedRequest("DELETE", `/report-configs/${id}`);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting report config:", error);
    const message = error instanceof Error ? error.message : "Failed to delete report config";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}
