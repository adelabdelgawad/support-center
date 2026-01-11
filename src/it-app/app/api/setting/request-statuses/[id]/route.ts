import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * GET /api/setting/request-statuses/[id]
 * Fetches a single request status
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await makeAuthenticatedRequest<unknown>(
      'GET',
      `/request-statuses/${id}`
    );
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

/**
 * PUT /api/setting/request-statuses/[id]
 * Updates an existing request status
 */
export async function PUT(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<unknown>(
      'PUT',
      `/request-statuses/${id}`,
      body
    );
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

/**
 * DELETE /api/setting/request-statuses/[id]
 * Deletes a request status
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await makeAuthenticatedRequest<unknown>(
      'DELETE',
      `/request-statuses/${id}`
    );
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
