/**
 * API Route Helper
 * Simplifies Next.js API routes that proxy to FastAPI backend
 *
 * Reduces API route boilerplate from 30+ lines to 3-5 lines.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ServerFetchError } from './server-fetch';

/**
 * Wrap an API route handler with authentication and error handling
 *
 * This helper:
 * - Extracts access token from cookies
 * - Returns 401 if token is missing
 * - Handles errors with proper status codes
 * - Returns JSON responses
 *
 * @example
 * // Before (30+ lines):
 * export async function GET(request: NextRequest) {
 *   try {
 *     const token = await getServerAccessToken();
 *     if (!token) {
 *       return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
 *     }
 *     const response = await makeAuthenticatedRequest('GET', '/users/');
 *     return NextResponse.json(response);
 *   } catch (error) {
 *     // 15+ lines of error handling
 *   }
 * }
 *
 * // After (3 lines):
 * export async function GET(request: NextRequest) {
 *   const params = request.nextUrl.searchParams.toString();
 *   return withAuth(() => makeAuthenticatedRequest('GET', `/users/?${params}`));
 * }
 */
export async function withAuth<T>(
  handler: () => Promise<T>
): Promise<NextResponse> {
  try {
    // Extract token from httpOnly cookie
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;

    if (!token) {
      return NextResponse.json(
        { detail: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Execute the handler (typically a backend API call)
    const data = await handler();

    // Return success response
    return NextResponse.json(data);
  } catch (error) {
    // Handle known API errors
    if (error instanceof ServerFetchError) {
      return NextResponse.json(
        {
          error: error.status === 401
            ? "Authentication required"
            : "Request failed",
          detail: error.message
        },
        { status: error.status }
      );
    }

    // Handle unexpected errors
    console.error('API route error:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Example usage patterns:
 *
 * GET with query params:
 * export async function GET(request: NextRequest) {
 *   const params = request.nextUrl.searchParams.toString();
 *   return withAuth(() => makeAuthenticatedRequest('GET', `/resource/?${params}`));
 * }
 *
 * POST with body:
 * export async function POST(request: NextRequest) {
 *   const body = await request.json();
 *   return withAuth(() => makeAuthenticatedRequest('POST', '/resource/', body));
 * }
 *
 * Dynamic route:
 * export async function GET(
 *   request: NextRequest,
 *   { params }: { params: Promise<{ id: string }> }
 * ) {
 *   const { id } = await params;
 *   return withAuth(() => makeAuthenticatedRequest('GET', `/resource/${id}`));
 * }
 */
