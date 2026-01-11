import { NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/request-statuses/counts
 * Fetches request status count statistics
 */
export async function GET() {
  try {
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      '/request-statuses/counts'
    );
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
