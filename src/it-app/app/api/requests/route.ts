/**
 * Service Requests API Route
 * Handles service request operations via backend API
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend response returned to client
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * POST /api/requests - Create new service request
 *
 * Client sends only title.
 * Backend auto-captures: IP, business unit, requester ID, priority, status
 */
export async function POST(request: NextRequest) {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('access_token');

    // Check if access token is missing
    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Authentication required",
          detail: "No access token found in cookies. Please log in again.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate request body
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        {
          error: "Validation error",
          detail: "Title is required and must be a string",
        },
        { status: 400 }
      );
    }

    if (body.title.trim().length < 5) {
      return NextResponse.json(
        {
          error: "Validation error",
          detail: "Title must be at least 5 characters long",
        },
        { status: 400 }
      );
    }

    // Extract real client IP from the request
    const forwarded = request.headers.get("x-forwarded-for");
    let realIp = forwarded ? forwarded.split(",")[0] : request.headers.get("x-real-ip") || "unknown";

    // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
    if (realIp.startsWith('::ffff:')) {
      realIp = realIp.substring(7);
    }

    const requestData: { title: string; tagId?: number } = {
      title: body.title.trim(),
    };

    // Include tagId if provided
    if (body.tagId !== undefined && body.tagId !== null) {
      requestData.tagId = body.tagId;
    }

    const response = await makeAuthenticatedRequest<unknown>(
      'POST',
      '/requests',
      requestData,
      {
        headers: {
          'X-Forwarded-For': realIp,
          'X-Real-IP': realIp,
        }
      }
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const apiError = error instanceof ServerFetchError ? error : null;
    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to create service request",
        detail: message,
      },
      { status }
    );
  }
}

/**
 * GET /api/requests - List service requests
 *
 * Supports query parameters for filtering and pagination:
 * - page: Page number (default: 1)
 * - perPage: Items per page (default: 20, max: 100)
 * - statusId: Filter by status
 * - categoryId: Filter by category
 * - assignedTechnicianId: Filter by assigned technician
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Build query string for backend
    const params: Record<string, string> = {};

    const page = searchParams.get('page');
    const perPage = searchParams.get('perPage');
    const statusId = searchParams.get('statusId');
    const categoryId = searchParams.get('categoryId');
    const assignedTechnicianId = searchParams.get('assignedTechnicianId');

    if (page) params.page = page;
    if (perPage) params.perPage = perPage;
    if (statusId) params.statusId = statusId;
    if (categoryId) params.categoryId = categoryId;
    if (assignedTechnicianId) params.assignedTechnicianId = assignedTechnicianId;

    // Convert params to query string
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/requests?${queryString}` : '/requests';

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>('GET', endpoint);

    return NextResponse.json(response);
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve service requests",
        detail: message,
      },
      { status }
    );
  }
}
