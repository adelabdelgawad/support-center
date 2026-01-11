import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/devices
 * Fetches devices with filtering
 */
export async function GET(_request: NextRequest) {
  try {
    const searchParams = _request.nextUrl.searchParams;
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/devices?${searchParams.toString()}`
    );
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
