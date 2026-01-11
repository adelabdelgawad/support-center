import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ subTaskId: string }> }
) {
  try {
    const { subTaskId } = await context.params;
    const response = await makeAuthenticatedRequest(
      'GET',
      `/sub-tasks/${subTaskId}`
    );
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to fetch sub-task' },
      { status: error.status || 404 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ subTaskId: string }> }
) {
  try {
    const { subTaskId } = await context.params;
    const body = await request.json();
    const response = await makeAuthenticatedRequest(
      'PATCH',
      `/sub-tasks/${subTaskId}`,
      body
    );
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to update sub-task' },
      { status: error.status || 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ subTaskId: string }> }
) {
  try {
    const { subTaskId } = await context.params;
    await makeAuthenticatedRequest('DELETE', `/sub-tasks/${subTaskId}`);
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to delete sub-task' },
      { status: error.status || 500 }
    );
  }
}
