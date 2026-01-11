import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/system-events
 * Fetches system events with pagination and filtering
 */
export async function GET(_request: NextRequest) {
  try {
    // Forward all query parameters to the backend
    const searchParams = _request.nextUrl.searchParams;

    const response = await makeAuthenticatedRequest(
      'GET',
      `/system-events?${searchParams.toString()}`
    );

    return NextResponse.json(response);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}

/**
 * POST /api/setting/system-events
 * Creates a new system event
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();

    const response = await makeAuthenticatedRequest(
      'POST',
      '/system-events',
      body
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
