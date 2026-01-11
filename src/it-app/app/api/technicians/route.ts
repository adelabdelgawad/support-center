/**
 * Technicians API Route
 * Fetches list of active technicians from Redis-cached backend endpoint
 *
 * This route acts as a proxy between client and backend:
 * - Client calls Next.js API route
 * - API route calls backend with proper authentication
 * - Backend returns data from Redis cache (cache:technicians)
 *
 * IMPORTANT: Never call backend directly from client components!
 */
import { NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

/**
 * GET /api/technicians - List all active technicians
 *
 * Returns cached list of technicians from backend.
 * Backend serves from Redis cache for optimal performance.
 *
 * Response format:
 * [
 *   {
 *     "id": 1,
 *     "username": "john.doe",
 *     "fullName": "John Doe",
 *     "title": "Senior Technician",
 *     "email": "john@example.com"
 *   }
 * ]
 */
export async function GET() {
  try {
    // Call backend API with authentication
    // Backend endpoint filters for is_technician=true and is_active=true
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      '/users?is_technician=true&is_active=true'
    );

    return NextResponse.json(response);
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to retrieve technicians",
        detail: message,
      },
      { status }
    );
  }
}
