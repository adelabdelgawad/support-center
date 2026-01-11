/**
 * API route for technician to take (self-assign) a request
 * POST /api/requests-details/[id]/take
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError } from '@/lib/api/route-error-handler';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;

    // Call backend to take the request (self-assign)
    const response = await makeAuthenticatedRequest(
      'POST',
      `/requests/${requestId}/take`
    );

    return NextResponse.json({
      success: true,
      message: 'Request taken successfully',
      data: response,
    });
  } catch (error) {
    return handleRouteError(error, 'Take Request');
  }
}
