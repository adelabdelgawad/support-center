/**
 * Client API for chat cache operations
 *
 * These functions call the Next.js API routes (not backend directly)
 * and include credentials for httpOnly cookie authentication.
 */

import type { CachedMessage, DeltaSyncResponse } from '@/lib/cache/schemas';

const API_BASE = '/api/chat/messages/request';

export interface DeltaSyncOptions {
  sinceSequence: number;
  limit?: number;
}

export interface RangeQueryOptions {
  startSequence: number;
  endSequence: number;
}

/**
 * Fetch messages using delta sync (newer than since_sequence)
 *
 * @param requestId - Chat request ID
 * @param options - Delta sync options
 * @returns Array of cached messages
 */
export async function getMessagesDelta(
  requestId: string,
  options: DeltaSyncOptions
): Promise<CachedMessage[]> {
  const params = new URLSearchParams({
    since_sequence: options.sinceSequence.toString(),
    ...(options.limit && { limit: options.limit.toString() }),
  });

  const response = await fetch(`${API_BASE}/${requestId}?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include httpOnly cookies
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Delta sync failed');
  }

  return await response.json();
}

/**
 * Fetch messages by sequence range (for gap filling)
 *
 * @param requestId - Chat request ID
 * @param options - Range query options
 * @returns Array of cached messages
 */
export async function getMessagesRange(
  requestId: string,
  options: RangeQueryOptions
): Promise<CachedMessage[]> {
  const params = new URLSearchParams({
    start_sequence: options.startSequence.toString(),
    end_sequence: options.endSequence.toString(),
  });

  const response = await fetch(`${API_BASE}/${requestId}?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Range query failed');
  }

  return await response.json();
}

/**
 * Get sync headers from response
 *
 * @param requestId - Chat request ID
 * @param options - Query options
 * @returns Response headers and data
 */
export async function getMessagesWithHeaders(
  requestId: string,
  options: DeltaSyncOptions | RangeQueryOptions | { limit?: number; beforeSequence?: number }
): Promise<{ data: CachedMessage[]; headers: Record<string, string> }> {
  const params = new URLSearchParams();

  if ('sinceSequence' in options) {
    params.set('since_sequence', options.sinceSequence.toString());
    if (options.limit) params.set('limit', options.limit.toString());
  } else if ('startSequence' in options) {
    params.set('start_sequence', options.startSequence.toString());
    params.set('end_sequence', options.endSequence.toString());
  } else {
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.beforeSequence) params.set('before_sequence', options.beforeSequence.toString());
  }

  const response = await fetch(`${API_BASE}/${requestId}${params.toString() ? `?${params}` : ''}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Fetch failed');
  }

  // Extract headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key.startsWith('x-')) {
      headers[key] = value;
    }
  });

  const data = await response.json();

  return { data, headers };
}
