/**
 * API route for user custom views - Get or create user's view
 *
 * Backend design: ONE view per user (auto-created on first GET)
 * - GET: Returns user's view (creates default if doesn't exist)
 * - PUT: Update user's view (use /user-custom-views/update route)
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';
import type { UserCustomView } from '@/types/custom-views';

export async function GET() {
  try {
    // Backend auto-creates a default view if it doesn't exist
    const response = await makeAuthenticatedRequest<UserCustomView>(
      'GET',
      '/user-custom-views'
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching custom view:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch custom view';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
