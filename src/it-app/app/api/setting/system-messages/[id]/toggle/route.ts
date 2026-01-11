import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface EnhancedError extends Error {
  status?: number;
  detail?: string;
}

interface SystemMessage {
  isActive: boolean;
  [key: string]: unknown;
}

/**
 * PATCH /api/setting/system-messages/[id]/toggle
 * Toggles system message status (active/inactive)
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Get current message
    const currentMessage = await makeAuthenticatedRequest<SystemMessage>('GET', `/system-messages/${id}`);

    // Toggle the status
    const response = await makeAuthenticatedRequest<unknown>('PATCH', `/system-messages/${id}`, {
      isActive: !currentMessage.isActive,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = getServerErrorMessage(error);
    const status = (error as EnhancedError).status || 500;
    return NextResponse.json({ detail: message }, { status });
  }
}
