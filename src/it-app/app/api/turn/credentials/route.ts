/**
 * TURN Credentials API Route
 *
 * Fetches TURN server credentials from backend for WebRTC NAT traversal.
 * Returns ICE servers configuration including STUN and TURN servers.
 *
 * Authentication: Required (httpOnly cookie with refresh token)
 * Method: GET
 *
 * Response:
 * {
 *   iceServers: [
 *     { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
 *     { urls: "turn:server.com:3478", username: "...", credential: "..." }
 *   ],
 *   ttl: 86400
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { makeAuthenticatedRequest } from "@/lib/api/server-fetch";

export async function GET(request: NextRequest) {
  try {
    const data = await makeAuthenticatedRequest<{
      iceServers: Array<{
        urls: string | string[];
        username?: string;
        credential?: string;
      }>;
      ttl: number;
    }>('GET', '/turn/credentials');

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[/api/turn/credentials] Error fetching TURN credentials:', error);

    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch TURN credentials',
        detail: 'TURN server credentials could not be retrieved. Falling back to STUN only.'
      },
      { status: error.status || 500 }
    );
  }
}
