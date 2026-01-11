/**
 * API route for updating request priority
 * PATCH /api/requests-details/[id]/priority
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
    const { priorityId } = body;

    if (!priorityId) {
      return NextResponse.json(
        { detail: 'priorityId is required' },
        { status: 400 }
      );
    }

    // Call backend to update priority
    const updatedTicket = await makeAuthenticatedRequest<ServiceRequestDetail>(
      'PATCH',
      `/requests/${requestId}`,
      { priority_id: priorityId }
    );

    return NextResponse.json(updatedTicket);
  } catch (error: any) {
    console.error('Error updating priority:', error);

    const status = error?.response?.status || error?.status || 500;
    const detail = error?.response?.data?.detail || error?.message || 'Failed to update priority';

    return NextResponse.json({ detail }, { status });
  }
}
