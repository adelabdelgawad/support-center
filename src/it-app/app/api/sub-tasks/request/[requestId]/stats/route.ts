import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;

    const response = await makeAuthenticatedRequest(
      'GET',
      `/requests/${requestId}/sub-tasks/stats`
    );

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to fetch sub-task stats' },
      { status: error.status || 500 }
    );
  }
}
