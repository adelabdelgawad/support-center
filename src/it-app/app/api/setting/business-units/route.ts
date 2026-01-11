import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/business-units
 * Fetches business units with pagination, filtering, and sorting
 */
export async function GET(_request: NextRequest) {
  try {
    // Forward all query parameters to the backend
    const searchParams = _request.nextUrl.searchParams;
    const response = await makeAuthenticatedRequest<unknown>('GET', `/business-units/?${searchParams.toString()}`);
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

/**
 * POST /api/setting/business-units
 * Creates a new business unit
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<unknown>('POST', `/business-units/`, body);
    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
