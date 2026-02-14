/**
 * API route for discovering Organizational Units from Active Directory
 * GET /api/organizational-units/discover - Discover OUs from AD
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/organizational-units/discover
 * Discovers organizational units from Active Directory
 */
export async function GET(_request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest<Array<{
      ouName: string;
      ouDn: string;
      alreadyExists: boolean;
    }>>('GET', '/organizational-units/discover');

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
