import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * PUT /api/setting/request-types/[id]/status
 * Toggles a request type's active status
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const data = await makeAuthenticatedRequest('PUT', `/request-types/${id}/status`);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    return NextResponse.json(
      { detail: enhancedError.detail || getServerErrorMessage(error) },
      { status: enhancedError.status || 500 }
    );
  }
}
