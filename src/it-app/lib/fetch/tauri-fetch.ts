/**
 * Tauri-specific fetch implementation
 * Only imported when running in Tauri environment
 */

import { ApiError, extractErrorMessage } from './errors';
import { getUnifiedAccessToken } from '@/lib/utils/auth-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_BASE_PATH = '/api/v1';

export async function tauriFetch<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const accessToken = await getUnifiedAccessToken();

  // In Tauri, call backend directly
  const fullUrl = `${API_URL}${API_BASE_PATH}${url}`;

  const response = await fetch(fullUrl, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(data),
      response.status,
      data,
      fullUrl,
      options.method
    );
  }

  return data as T;
}
