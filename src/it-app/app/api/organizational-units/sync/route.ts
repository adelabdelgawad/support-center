/**
 * API route for syncing Organizational Units
 * POST /api/organizational-units/sync - Bulk sync OUs (create added, delete removed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * POST /api/organizational-units/sync
 * Bulk sync organizational units: create added OUs and delete removed OUs
 */
export async function POST(_request: NextRequest) {
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<{
      createdCount: number;
      deletedCount: number;
    }>('POST', '/organizational-units/sync', body);

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
