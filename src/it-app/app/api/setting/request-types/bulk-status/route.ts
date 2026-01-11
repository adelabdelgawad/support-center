import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/setting/request-types/bulk-status
 * Bulk update request types status
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const data = await makeAuthenticatedRequest('POST', '/request-types/bulk-status', body);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    return NextResponse.json(
      { detail: enhancedError.detail || getServerErrorMessage(error) },
      { status: enhancedError.status || 500 }
    );
  }
}
