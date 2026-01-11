import { NextResponse } from 'next/server';
import { makeAuthenticatedRequest } from '@/lib/api/server-fetch';

export async function GET() {
  try {
    const response = await makeAuthenticatedRequest('GET', '/requests/ticket-type-counts');
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { detail: error.message || 'Failed to fetch ticket type counts' },
      { status: error.status || 500 }
    );
  }
}
