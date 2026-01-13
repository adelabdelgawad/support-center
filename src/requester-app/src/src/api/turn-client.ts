/**
 * TURN Credentials Client for Requester App
 *
 * Fetches TURN server credentials from backend to enable WebRTC NAT traversal
 * for remote access sessions.
 */

import { apiClient } from './client';
import { logger } from '@/logging/logger';

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
 * Throws an error if TURN credentials cannot be fetched (fail-fast approach).
 *
 * @returns Promise resolving to array of ICE servers
 * @throws Error if TURN credentials cannot be fetched
 *
 * @example
 * const iceServers = await fetchTURNCredentials();
 * const pc = new RTCPeerConnection({ iceServers });
 */
export async function fetchTURNCredentials(): Promise<ICEServer[]> {
  try {
    logger.info('remote-support', 'Fetching TURN credentials from backend');
    const response = await apiClient.get<TURNCredentials>('/turn/credentials');
    const credentials = response.data;

    // Log TURN servers for debugging (without credentials)
    const turnServers = credentials.iceServers.filter(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.some(url => url.startsWith('turn:'));
    });

    logger.info('remote-support', 'TURN credentials fetched successfully', {
      totalServers: credentials.iceServers.length,
      turnServers: turnServers.length,
      ttl: credentials.ttl,
    });

    // Also keep console.log for dev mode visibility
    console.log('[TURN] Fetched credentials:', credentials.iceServers.length, 'servers');

    if (turnServers.length === 0) {
      logger.warn('remote-support', 'No TURN servers in response, only STUN available');
      console.warn('[TURN] No TURN servers in response, using STUN only');
    }

    return credentials.iceServers;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('remote-support', 'TURN credentials fetch failed', {
      error: errorMessage,
    });
    console.error('[TURN] Failed to fetch credentials:', error);

    // Fail fast: throw error instead of silent fallback to STUN
    // This is critical because iceTransportPolicy='relay' requires TURN servers
    throw new Error(`Remote access unavailable: Failed to fetch TURN credentials. ${errorMessage}`);
  }
}
