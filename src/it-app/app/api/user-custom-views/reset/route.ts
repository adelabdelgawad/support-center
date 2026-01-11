/**
 * API route for resetting user custom view to defaults
 */

import { NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import type { UserCustomView } from '@/types/custom-views';

export async function POST() {
  try {
    const response = await makeAuthenticatedRequest<UserCustomView>(
      'POST',
      '/user-custom-views/reset'
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error resetting custom view:', error);
    const message = error instanceof Error ? error.message : 'Failed to reset custom view';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
