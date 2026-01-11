import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/screenshots/by-filename/[filename]
 *
 * Proxy endpoint for downloading screenshots by filename.
 * This allows the frontend to download screenshots using the filename
 * from ChatMessage.screenshot_file_name without exposing backend credentials.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Call backend endpoint with authentication
    const response = await makeAuthenticatedRequest<ArrayBuffer>(
      'GET',
      `/screenshots/by-filename/${filename}`,
      undefined,
      {
        responseType: 'arraybuffer',
        // Pass through to get raw response
      }
    );

    // Return image with proper headers
    return new NextResponse(response as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[Screenshot Download] Error:', error);

    // Return appropriate error response
    // EnhancedError has status property, not response.status
    const status = error.status || 500;

    if (status === 404) {
      return NextResponse.json(
        { error: 'Screenshot not found' },
        { status: 404 }
      );
    }

    if (status === 202) {
      return NextResponse.json(
        { error: 'Screenshot upload in progress' },
        { status: 202 }
      );
    }

    if (status === 410) {
      return NextResponse.json(
        { error: 'Screenshot is corrupted or failed to upload' },
        { status: 410 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch screenshot' },
      { status }
    );
  }
}
