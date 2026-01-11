/**
 * API route for user profile
 * GET /api/profile
 */

import { NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

export async function GET() {
  try {
    const profile = await makeAuthenticatedRequest('GET', '/profile/');
    return NextResponse.json(profile);
  } catch (error) {
    return handleRouteError(error, 'Fetch Profile');
  }
}
