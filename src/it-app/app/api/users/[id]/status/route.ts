/**
 * User Status API Route
 * Handles fetching and updating user activation status
 */
import { NextRequest, NextResponse } from "next/server";
import { ServerFetchError } from "@/lib/api/server-fetch";
import { makeAuthenticatedRequest, getServerErrorMessage } from "@/lib/api/server-fetch";

export interface UserConnection {
  ipAddress: string;
  userAgent: string;
  lastHeartbeat: string | null;
}

export interface UserSessionStatus {
  userId: string;
  isOnline: boolean;
  connections?: UserConnection[];
  // Deprecated fields - kept for backwards compatibility
  ipAddress?: string;
  lastActivity?: string;
}

/**
 * GET /api/users/[id]/status - Fetch user's current session status (online/offline and IP address)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { detail: 'User ID is required' },
        { status: 400 }
      );
    }

    // Call backend endpoint to get real-time WebSocket connection status
    const connectionStatus = await makeAuthenticatedRequest<UserSessionStatus>(
      'GET',
      `/users/${id}/connection-status`
    );

    // Return connection status with all active connections
    return NextResponse.json<UserSessionStatus>(
      {
        userId: id,
        isOnline: connectionStatus.isOnline,
        connections: connectionStatus.connections || [],
        // Backwards compatibility: include first connection's IP
        ipAddress: connectionStatus.connections?.[0]?.ipAddress,
        lastActivity: connectionStatus.connections?.[0]?.lastHeartbeat || undefined,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Failed to fetch user connection status:', error);

    // Return offline status on any error (graceful degradation)
    const { id } = await params;

    return NextResponse.json<UserSessionStatus>(
      {
        userId: id,
        isOnline: false,
        connections: [],
      },
      { status: 200 }
    );
  }
}

/**
 * PUT /api/users/[id]/status - Update user status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Call backend API with authentication
    const response = await makeAuthenticatedRequest<unknown>(
      'PUT',
      `/users/${id}/status`,
      body
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error(`Update user status error:`, error);

    const message = getServerErrorMessage(error);
    const status = error instanceof ServerFetchError ? (error.status) : 500;

    return NextResponse.json(
      {
        error: "Failed to update user status",
        detail: message,
      },
      { status }
    );
  }
}
