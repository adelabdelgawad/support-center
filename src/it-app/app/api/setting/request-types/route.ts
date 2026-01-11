import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/request-types
 * Fetches request types with optional filtering
 */
export async function GET(_request: NextRequest) {
  try {
    const searchParams = _request.nextUrl.searchParams;
    const data = await makeAuthenticatedRequest('GET', `/request-types?${searchParams.toString()}`);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    return NextResponse.json(
      { detail: enhancedError.detail || getServerErrorMessage(error) },
      { status: enhancedError.status || 500 }
    );
  }
}

/**
 * POST /api/setting/request-types
 * Creates a new request type
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const data = await makeAuthenticatedRequest('POST', '/request-types', body);
    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    return NextResponse.json(
      { detail: enhancedError.detail || getServerErrorMessage(error) },
      { status: enhancedError.status || 500 }
    );
  }
}
