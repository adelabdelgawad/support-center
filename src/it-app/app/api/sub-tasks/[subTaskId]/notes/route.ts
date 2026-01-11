import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ subTaskId: string }> }
) {
  try {
    const { subTaskId } = await context.params;
    const body = await request.json();
    const response = await makeAuthenticatedRequest(
      'POST',
      `/sub-tasks/${subTaskId}/notes`,
      body
    );
    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to add note' },
      { status: error.status || 500 }
    );
  }
}
