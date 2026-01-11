import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/setting/business-unit-regions/bulk-status
 * Bulk updates business unit regions status
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const data = await makeAuthenticatedRequest('POST', '/business-unit-regions/bulk-status', body);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
