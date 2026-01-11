import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await makeAuthenticatedRequest('POST', '/sub-tasks', body);

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to create sub-task' },
      { status: error.status || 500 }
    );
  }
}
