import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const page = searchParams.get("page") || "1";
    const perPage = searchParams.get("per_page") || "50";

    // Build query params
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    params.append("page", page);
    params.append("per_page", perPage);

    const response = await makeAuthenticatedRequest<{
      items: Array<{
        id: string;
        username: string;
        email?: string;
        displayName?: string;
        directManagerName?: string;
        phone?: string;
        office?: string;
        title?: string;
        createdAt: string;
        updatedAt: string;
      }>;
      total: number;
      page: number;
      perPage: number;
    }>("GET", `/domain-users?${params.toString()}`);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Domain users API route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch domain users" },
      { status: error.status || 500 }
    );
  }
}
