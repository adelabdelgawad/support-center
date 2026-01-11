import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';
import type { Device } from '@/types/device';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/management/devices/manual
 * Manually add a device
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await makeAuthenticatedRequest<Device>(
      'POST',
      `/devices/manual`,
      body
    );
    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
