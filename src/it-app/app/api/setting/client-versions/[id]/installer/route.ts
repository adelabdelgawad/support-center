import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

type RouteParams = { params: Promise<{ id: string }> };

// Backend API URL
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_BASE_PATH = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api/v1";

/**
 * POST /api/setting/client-versions/[id]/installer
 * Upload installer file for a client version
 *
 * Proxies the file upload to the backend with authentication.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get access token from cookies
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { detail: "Authentication required" },
        { status: 401 }
      );
    }

    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { detail: "No file provided" },
        { status: 400 }
      );
    }

    // Create a new FormData for the backend request
    const backendFormData = new FormData();
    backendFormData.append("file", file);

    // Forward the request to the backend
    const backendUrl = `${API_URL}${API_BASE_PATH}/client-versions/${id}/installer`;

    // Get forwarding headers
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };

    if (forwardedFor) {
      headers["X-Forwarded-For"] = forwardedFor;
    }
    if (realIp) {
      headers["X-Real-IP"] = realIp;
    }

    // Forward protocol and host for base URL generation
    const proto = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (proto) {
      headers["X-Forwarded-Proto"] = proto;
    }
    if (host) {
      headers["X-Forwarded-Host"] = host;
    }

    const response = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: backendFormData,
    });

    // Get the response data
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { detail: data.detail || "Upload failed" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error uploading installer:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
