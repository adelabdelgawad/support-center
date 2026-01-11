import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await makeAuthenticatedRequest("GET", `/sla-configs/${id}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching SLA config:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch SLA config";
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
      `/sla-configs/${id}`,
      body
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating SLA config:", error);
    const message = error instanceof Error ? error.message : "Failed to update SLA config";
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
    await makeAuthenticatedRequest("DELETE", `/sla-configs/${id}`);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting SLA config:", error);
    const message = error instanceof Error ? error.message : "Failed to delete SLA config";
    return NextResponse.json(
      { detail: message },
      { status: 500 }
    );
  }
}
