import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('per_page') || '20';

    // Calculate skip from page and perPage
    const skip = (parseInt(page) - 1) * parseInt(perPage);

    const response = await makeAuthenticatedRequest(
      'GET',
      `/requests/${requestId}/sub-tasks?skip=${skip}&limit=${perPage}`
    ) as any;

    // Forward pagination headers
    const headers = new Headers();
    if (response.headers?.['x-total-count']) {
      headers.set('X-Total-Count', response.headers['x-total-count']);
    }
    if (response.headers?.['x-page']) {
      headers.set('X-Page', response.headers['x-page']);
    }
    if (response.headers?.['x-per-page']) {
      headers.set('X-Per-Page', response.headers['x-per-page']);
    }

    return NextResponse.json(response, { headers });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to fetch sub-tasks' },
      { status: error.status || 500 }
    );
  }
}
