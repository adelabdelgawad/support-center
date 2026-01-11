import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/business-unit-regions/counts
 * Fetches business unit region count statistics
 */
export async function GET(_request: NextRequest) {
  try {
    const data = await makeAuthenticatedRequest('GET', '/business-unit-regions/counts');
    return NextResponse.json(data);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
