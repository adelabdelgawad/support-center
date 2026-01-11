/**
 * API route for unassigning technician from request
 * POST /api/requests-details/[id]/unassign
 *
 * Accepts: { technicianId: number } (camelCase from frontend)
 * Sends to backend: { technician_id: number } (snake_case)
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

    // Call backend to unassign technician (send snake_case)
    const response = await makeAuthenticatedRequest(
      'POST',
      `/requests/${requestId}/unassign`,
      { technician_id: technicianId }
    );

    return NextResponse.json({
      success: true,
      message: 'Technician unassigned successfully',
      data: response,
    });
  } catch (error) {
    return handleRouteError(error, 'Unassign Technician');
  }
}
