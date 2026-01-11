import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/system-messages
 * Fetches system messages with pagination and filtering
 */
export async function GET(_request: NextRequest) {
  try {
    // Forward all query parameters to the backend
    const searchParams = _request.nextUrl.searchParams;
    const response = await makeAuthenticatedRequest<unknown>('GET', `/system-messages?${searchParams.toString()}`);
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

/**
 * POST /api/setting/system-messages
 * Creates a new system message
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<unknown>('POST', '/system-messages', body);
    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
