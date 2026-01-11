import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    // Build query params for backend (uses per_page instead of limit)
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    params.append("page", page.toString());
    params.append("per_page", limit.toString());

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

    // Transform response to match useAuthUsers hook expectations
    const transformedResponse = {
      users: response.items.map((item) => ({
        id: parseInt(item.id) || 0, // Convert UUID to number for compatibility
        username: item.username,
        fullName: item.displayName || item.username,
        title: item.title,
        email: item.email,
      })),
      total: response.total,
      page: response.page,
      limit: response.perPage,
      totalPages: Math.ceil(response.total / response.perPage),
    };

    return NextResponse.json(transformedResponse);
  } catch (error: any) {
    console.error("Domain users search API route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch domain users" },
      { status: error.status || 500 }
    );
  }
}
