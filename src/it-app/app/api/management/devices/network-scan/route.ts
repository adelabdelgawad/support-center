import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';
import type { DiscoveryResponse } from '@/types/device';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/management/devices/network-scan
 * Scan a network range for devices
 *
 * SECURITY NOTE: This endpoint triggers network scanning.
 * - Maximum /24 subnet (256 addresses)
 * - Non-credentialed TCP connect only
 * - Requires explicit user action
 *
 * NOTE: Network scans can take several minutes for large ranges.
 * Timeout set to 10 minutes (600000ms) to accommodate this.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await makeAuthenticatedRequest<DiscoveryResponse>(
      'POST',
      `/devices/network-scan`,
      body,
      { timeout: 600000 } // 10 minutes for network scans
    );
    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
