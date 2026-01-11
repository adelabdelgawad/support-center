/**
 * API route for updating request status
 * PATCH /api/requests-details/[id]/status
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import type { ServiceRequestDetail } from '@/types/ticket-detail';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;
    const body = await request.json();
    const { statusId, resolution } = body;

    if (!statusId) {
      return NextResponse.json(
        { detail: 'statusId is required' },
        { status: 400 }
      );
    }

    // Build payload for backend
    const payload: any = { status_id: statusId };
    if (resolution) {
      payload.resolution = resolution;
    }

    // Call backend to update status
    const updatedTicket = await makeAuthenticatedRequest<ServiceRequestDetail>(
      'PATCH',
      `/requests/${requestId}`,
      payload
    );

    return NextResponse.json(updatedTicket);
  } catch (error: any) {
    console.error('Error updating status:', error);

    const status = error?.response?.status || error?.status || 500;
    const detail = error?.response?.data?.detail || error?.message || 'Failed to update status';

    return NextResponse.json({ detail }, { status });
  }
}
