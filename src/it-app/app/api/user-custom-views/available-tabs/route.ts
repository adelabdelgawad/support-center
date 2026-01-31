/**
 * API route for getting available tabs
 */

import { NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

export async function GET() {
  try {
    const response = await makeAuthenticatedRequest<{ availableTabs: string[] }>(
      'GET',
      '/user-custom-views/available-tabs'
    );

    return NextResponse.json(response.availableTabs);
  } catch (error) {
    console.error('Error fetching available tabs:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch available tabs';
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
