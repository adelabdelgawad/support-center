/**
 * TURN Credentials Client for Requester App
 *
 * Fetches TURN server credentials from backend to enable WebRTC NAT traversal
 * for remote access sessions.
 */

import { apiClient } from './client';

export interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TURNCredentials {
  iceServers: ICEServer[];
  ttl: number;
}

/**
 * Fetch TURN credentials from backend
 *
 * Returns ICE servers configuration including STUN and TURN servers.
 * Falls back to STUN-only if TURN credentials cannot be fetched.
 *
 * @returns Promise resolving to array of ICE servers
 *
 * @example
 * const iceServers = await fetchTURNCredentials();
 * const pc = new RTCPeerConnection({ iceServers });
 */
export async function fetchTURNCredentials(): Promise<ICEServer[]> {
  try {
    const response = await apiClient.get<TURNCredentials>('/turn/credentials');
    const credentials = response.data;
    console.log('[TURN] Fetched credentials:', credentials.iceServers.length, 'servers');

    // Log TURN servers for debugging (without credentials)
    const turnServers = credentials.iceServers.filter(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some(url => url.startsWith('turn:'));
    });

    if (turnServers.length > 0) {
      console.log('[TURN] TURN servers available:', turnServers.length);
    } else {
      console.warn('[TURN] No TURN servers in response, using STUN only');
    }

    return credentials.iceServers;
  } catch (error) {
    console.error('[TURN] Failed to fetch credentials:', error);
    console.warn('[TURN] Falling back to STUN-only mode');

    // Fallback to public STUN servers
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
  }
}
