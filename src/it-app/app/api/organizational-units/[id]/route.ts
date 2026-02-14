/**
 * API route for single Organizational Unit operations
 * PATCH /api/organizational-units/[id] - Update an OU
 * DELETE /api/organizational-units/[id] - Delete an OU
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

/**
 * PATCH /api/organizational-units/[id]
 * Updates an existing organizational unit
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await _request.json();
    const response = await makeAuthenticatedRequest<unknown>('PATCH', `/organizational-units/${id}`, body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}

/**
 * DELETE /api/organizational-units/[id]
 * Deletes an organizational unit
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await makeAuthenticatedRequest<unknown>('DELETE', `/organizational-units/${id}`);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
