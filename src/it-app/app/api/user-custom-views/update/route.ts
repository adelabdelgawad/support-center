/**
 * API route for updating user custom view
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import type { UserCustomView } from '@/types/custom-views';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await makeAuthenticatedRequest<UserCustomView>(
      'PUT',
      '/user-custom-views',
      body
    );

    // Invalidate cached custom view for requests page
    revalidatePath('/support-center/requests');

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating custom view:', error);
    const message = error instanceof Error ? error.message : 'Failed to update custom view';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
