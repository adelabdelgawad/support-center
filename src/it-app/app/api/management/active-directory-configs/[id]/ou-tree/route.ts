import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tree = await makeAuthenticatedRequest(
      "GET",
      `/active-directory-configs/${id}/ou-tree`
    );

    return NextResponse.json(tree);
  } catch (error: any) {
    console.error("Error fetching OU tree:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch OU tree" },
      { status: error.status || 500 }
    );
  }
}
