import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

// Image MIME types that should go to screenshots endpoint
const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/bmp",
]);

// Check if file is an image based on MIME type
function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.has(file.type);
}

interface ScreenshotUploadResponse {
  screenshot: {
    filename: string;
    id: number;
    request_id: string;
    upload_status: string;
  };
  upload_status: string;
  message: string;
}

interface ChatFileUploadResponse {
  file: {
    id: number;
    request_id: string;
    original_filename: string;
    stored_filename: string;
    file_size: number;
    mime_type: string;
    upload_status: string;
  };
  upload_status: string;
  message: string;
}

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
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return NextResponse.json(
        { detail: "No files provided" },
        { status: 400 }
      );
    }

    // Validate that all entries are File objects
    const validFiles = files.filter((file) => file instanceof File) as File[];
    if (validFiles.length === 0) {
      return NextResponse.json(
        { detail: "No valid files provided" },
        { status: 400 }
      );
    }

    // Upload each file to the appropriate backend endpoint
    const uploadPromises = validFiles.map(async (file) => {
      const fileFormData = new FormData();
      fileFormData.append("file", file);

      try {
        // Route to appropriate endpoint based on file type
        if (isImageFile(file)) {
          // Images go to screenshots endpoint
          const response = await makeAuthenticatedRequest<ScreenshotUploadResponse>(
            "POST",
            `/screenshots/upload?request_id=${requestId}`,
            fileFormData
          );

          return {
            success: true,
            type: "screenshot" as const,
            filename: file.name,
            screenshot_file_name: response.screenshot?.filename,
            message: response.message,
          };
        } else {
          // Non-images go to chat-files endpoint
          const response = await makeAuthenticatedRequest<ChatFileUploadResponse>(
            "POST",
            `/chat-files/upload?request_id=${requestId}`,
            fileFormData
          );

          return {
            success: true,
            type: "file" as const,
            filename: file.name,
            stored_filename: response.file?.stored_filename,
            original_filename: response.file?.original_filename,
            file_size: response.file?.file_size,
            mime_type: response.file?.mime_type,
            file_id: response.file?.id,
            message: response.message,
          };
        }
      } catch (error: any) {
        // Extract error message from backend response
        const errorMessage =
          error?.response?.data?.detail ||
          error?.message ||
          "Upload failed";

        return {
          success: false,
          type: isImageFile(file) ? ("screenshot" as const) : ("file" as const),
          filename: file.name,
          error: errorMessage,
        };
      }
    });

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);

    // Separate successful and failed uploads
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Determine response status
    if (successful.length === 0) {
      // All uploads failed
      return NextResponse.json(
        {
          detail: "All uploads failed",
          results,
        },
        { status: 400 }
      );
    } else if (failed.length > 0) {
      // Some uploads failed
      return NextResponse.json(
        {
          message: `${successful.length} of ${results.length} files uploaded successfully`,
          results,
        },
        { status: 207 } // Multi-Status
      );
    } else {
      // All uploads succeeded
      return NextResponse.json(
        {
          message: `${successful.length} file(s) uploaded successfully`,
          results,
        },
        { status: 200 }
      );
    }
  } catch (error: any) {
    console.error("Error in attachment upload:", error);
    return NextResponse.json(
      {
        detail: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
