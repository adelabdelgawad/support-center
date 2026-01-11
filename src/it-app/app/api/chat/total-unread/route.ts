/**
 * API route for getting total unread count across all chats.
 * Useful for notification badges in the UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { makeAuthenticatedRequest, getServerErrorMessage } from '@/lib/api/server-fetch';

interface TotalUnreadResponse {
  userId: number;
  totalUnread: number;
}

export async function GET(request: NextRequest) {
  try {
    const response = await makeAuthenticatedRequest<TotalUnreadResponse>(
      'GET',
      '/chat/total-unread'
    );

    return NextResponse.json(response);
  } catch (error) {
    const message = getServerErrorMessage(error);
    const status = (error as { status?: number })?.status || 500;

    console.error('Error fetching total unread count:', message);
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
