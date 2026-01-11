import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * PUT /api/setting/business-unit-regions/[id]/status
 * Toggles business unit region status
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const data = await makeAuthenticatedRequest('PUT', `/business-unit-regions/${id}/status`);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const enhancedError = error as EnhancedError;
    const status = enhancedError.status || 500;
    const detail = enhancedError.detail || getServerErrorMessage(error);
    return NextResponse.json({ detail }, { status });
  }
}
