import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/setting/business-units/bulk-status
 * Bulk updates business units status
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<unknown>('POST', `/business-units/bulk-status`, body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
