import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

/**
 * Response type from backend chat file upload endpoint
 */
interface ChatFileUploadResponse {
  storedFilename: string;
  originalFilename: string;
  contentType: string;
  size: number;
  message: string;
}

/**
 * POST /api/chat-files/upload
 *
 * Proxy endpoint for uploading chat files.
 * Forwards the file to backend `/chat-files/upload?request_id=...`
 * and returns the ChatFileUploadResponse.
 */
export async function POST(request: NextRequest) {
  try {
    // Extract request_id from query params
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("request_id");

    if (!requestId) {
      return NextResponse.json(
        { detail: "request_id is required" },
        { status: 400 }
      );
    }

    // Get the form data from the request
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { detail: "No file provided" },
        { status: 400 }
      );
    }

    // Validate that the entry is a File object
    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: "Invalid file provided" },
        { status: 400 }
      );
    }

    // Create new FormData to send to backend
    const backendFormData = new FormData();
    backendFormData.append("file", file);

    // Upload file to the backend
    const response = await makeAuthenticatedRequest<ChatFileUploadResponse>(
      "POST",
      `/chat-files/upload?request_id=${requestId}`,
      backendFormData
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    console.error("[Chat File Upload] Error:", error);

    // Handle ServerFetchError
    const status = (error as { status?: number })?.status || 500;
    const message =
      (error as { message?: string })?.message || "Failed to upload file";

    return NextResponse.json({ detail: message }, { status });
  }
}
