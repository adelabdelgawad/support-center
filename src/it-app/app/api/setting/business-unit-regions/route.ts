import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/business-unit-regions
 * Fetches business unit regions with pagination, filtering, and sorting
 */
export async function GET(_request: NextRequest) {
  try {
    // Forward all query parameters to the backend
    const searchParams = _request.nextUrl.searchParams;
    const data = await makeAuthenticatedRequest('GET', `/business-unit-regions?${searchParams.toString()}`);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}

/**
 * POST /api/setting/business-unit-regions
 * Creates a new business unit region
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const data = await makeAuthenticatedRequest('POST', '/business-unit-regions', body);
    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
