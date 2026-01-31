/**
 * API Route Helper Utilities
 * Reduces boilerplate in Next.js API routes
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from './errors';

type Handler = (token: string, request: NextRequest) => Promise<Response>;

/**
 * Wrap an API route handler with authentication check and error handling
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   return withAuth(request, async (token) => {
 *     const data = await serverGet('/users');
 *     return NextResponse.json(data);
 *   });
 * }
 */
export async function withAuth(request: NextRequest, handler: Handler): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { detail: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    return await handler(token, request);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status }
      );
    }
    console.error('API route error:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}
