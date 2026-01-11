import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/setting/system-messages/bulk-status
 * Bulk update system message status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await makeAuthenticatedRequest<unknown>('POST', '/system-messages/bulk-status', body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
