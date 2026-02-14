/**
 * API route for Organizational Units
 * GET /api/organizational-units - List all OUs with statistics
 * POST /api/organizational-units - Create a new OU
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/organizational-units
 * Fetches all organizational units with statistics
 */
export async function GET(_request: NextRequest) {
  try {
    const searchParams = _request.nextUrl.searchParams;
    const response = await makeAuthenticatedRequest<{
      organizationalUnits: Array<{
        id: number;
        ouName: string;
        ouDn: string | null;
        isEnabled: boolean;
        description: string | null;
        userCount: number;
        lastSyncedAt: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
      total: number;
      enabledCount: number;
      disabledCount: number;
    }>('GET', `/organizational-units?${searchParams.toString()}`);

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

/**
 * POST /api/organizational-units
 * Creates a new organizational unit
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<unknown>('POST', '/organizational-units', body);
    return NextResponse.json(response, { status: 201 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
