/**
 * Request Notes API Route
 * Handles creation of notes for service requests
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend creates note and returns it with creator information
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/fetch/errors";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * POST /api/request-notes - Create a new note for a service request
 *
 * Request body:
 * {
 *   "requestId": "uuid-string",
 *   "note": "Note content (1-2000 characters)"
 * }
 *
 * Response format:
 * {
 *   "id": 1,
 *   "requestId": "uuid-string",
 *   "note": "Note content",
 *   "createdBy": 123,
 *   "isSystemGenerated": false,
 *   "createdAt": "2025-11-20T17:00:00Z"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    if (!body.requestId || typeof body.requestId !== 'string') {
      return NextResponse.json(
        {
          error: "Validation error",
          detail: "requestId is required and must be a string",
        },
        { status: 400 }
      );
    }

    if (!body.note || typeof body.note !== 'string') {
      return NextResponse.json(
        {
          error: "Validation error",
          detail: "note is required and must be a string",
        },
        { status: 400 }
      );
    }

    const trimmedNote = body.note.trim();

    if (trimmedNote.length < 1) {
      return NextResponse.json(
        {
          error: "Validation error",
          detail: "note must be at least 1 character long",
        },
        { status: 400 }
      );
    }

    if (trimmedNote.length > 2000) {
      return NextResponse.json(
        {
          error: "Validation error",
          detail: "note must not exceed 2000 characters",
        },
        { status: 400 }
      );
    }

    // Call backend API with authentication
    // Backend automatically sets created_by from authenticated user
    const response = await makeAuthenticatedRequest<unknown>(
      'POST',
      '/request-notes',
      {
        requestId: body.requestId,
        note: trimmedNote,
        isSystemGenerated: body.isSystemGenerated || false,
      }
    );

    // Return the created note
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("❌ Create note error:", error);

    const apiError = error instanceof ApiError ? error : null;
    console.error("Error details:", {
      message: apiError?.message || 'Unknown error',
      status: apiError?.status,
      statusText: apiError?.detail,
      data: apiError?.detail,
    });

    const message = getServerErrorMessage(error);
    const status = apiError?.status || 500;

    return NextResponse.json(
      {
        error: "Failed to create note",
        detail: message,
      },
      { status }
    );
  }
}
