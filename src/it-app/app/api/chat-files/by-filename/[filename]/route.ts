import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/chat-files/by-filename/[filename]
 *
 * Proxy endpoint for downloading chat files by filename.
 * This allows the frontend to download files using the stored filename
 * without exposing backend credentials.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (!filename) {
      return NextResponse.json(
        { error: "Filename is required" },
        { status: 400 }
      );
    }

    // Call backend endpoint with authentication
    const response = await makeAuthenticatedRequest<ArrayBuffer>(
      "GET",
      `/chat-files/by-filename/${encodeURIComponent(filename)}`,
      undefined,
      {
        responseType: "arraybuffer",
      }
    );

    // Determine content type from filename extension
    const contentType = getContentTypeFromFilename(filename);

    // Return file with proper headers
    return new NextResponse(response as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error: unknown) {
    console.error("[Chat File Download] Error:", error);

    // Return appropriate error response
    const status = (error as { status?: number })?.status || 500;

    if (status === 404) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (status === 202) {
      return NextResponse.json(
        { error: "File upload in progress" },
        { status: 202 }
      );
    }

    if (status === 410) {
      return NextResponse.json(
        { error: "File is corrupted or failed to upload" },
        { status: 410 }
      );
    }

    return NextResponse.json(
      {
        error:
          (error as { message?: string })?.message || "Failed to fetch file",
      },
      { status }
    );
  }
}

/**
 * Get MIME content type from filename extension
 */
function getContentTypeFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",

    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    // Text
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",

    // Archives
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",

    // Audio/Video
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",

    // Other
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
  };

  return mimeTypes[extension || ""] || "application/octet-stream";
}
