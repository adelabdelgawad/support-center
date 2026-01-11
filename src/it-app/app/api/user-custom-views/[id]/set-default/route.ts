/**
 * API route for setting a custom view as default
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import type { UserCustomView } from '@/types/custom-views';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const response = await makeAuthenticatedRequest<UserCustomView>(
      'POST',
      `/user-custom-views/${id}/set-default`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error setting default view:', error);
    const message = error instanceof Error ? error.message : 'Failed to set default view';
    const status = (error as { status?: number }).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
