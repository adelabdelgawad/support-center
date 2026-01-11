/**
 * API route for assigning technician to request
 * POST /api/requests-details/[id]/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import { handleRouteError, validationError } from '@/lib/api/route-error-handler';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;
    const body = await request.json();
    const { technicianId } = body;

    if (!technicianId) {
      return validationError('technicianId', 'Technician ID is required');
    }

    // Call backend to assign technician (send snake_case)
    const response = await makeAuthenticatedRequest(
      'POST',
      `/requests/${requestId}/assign`,
      { technician_id: technicianId }
    );

    return NextResponse.json({
      success: true,
      message: 'Technician assigned successfully',
      data: response,
    });
  } catch (error) {
    return handleRouteError(error, 'Assign Technician');
  }
}
