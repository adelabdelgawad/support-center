/**
 * API route for getting unread count for a specific chat.
 * Returns unread count and last read timestamp for the current user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface ChatUnreadResponse {
  requestId: string;
  unreadCount: number;
  lastReadAt: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;

    const response = await makeAuthenticatedRequest<ChatUnreadResponse>(
      'GET',
      `/chat/${requestId}/unread`
    );

    return NextResponse.json(response);
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status = (error as { status?: number })?.status || 500;

    console.error('Error fetching chat unread count:', message);
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
