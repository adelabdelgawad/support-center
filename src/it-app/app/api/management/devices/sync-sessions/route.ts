import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';
import type { DiscoveryResponse } from '@/types/device';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/management/devices/sync-sessions
 * Syncs devices from desktop sessions
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json().catch(() => ({ activeOnly: true }));
    const response = await makeAuthenticatedRequest<DiscoveryResponse>(
      'POST',
      `/devices/sync-sessions`,
      body
    );
    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
