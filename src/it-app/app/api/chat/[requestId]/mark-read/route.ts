/**
 * API route for marking a specific chat as fully read.
 * Sets unread_count to 0 and updates last_read_at timestamp.
 */
import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface MarkChatAsReadResponse {
  requestId: string;
  userId: number;
  markedAt: string;
  previousUnread: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;

    const response = await makeAuthenticatedRequest<MarkChatAsReadResponse>(
      'POST',
      `/chat/${requestId}/mark-read`
    );

    return NextResponse.json(response);
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status = (error as { status?: number })?.status || 500;

    console.error('Error marking chat as read:', message);
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
