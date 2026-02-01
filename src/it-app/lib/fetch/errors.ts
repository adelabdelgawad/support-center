/**
 * Shared ApiError class — isomorphic (works on client and server)
 *
 * Single error class used across all fetch utilities:
 * - lib/fetch/client.ts (client-side)
 * - lib/api/server-fetch.ts (server-side)
 * - lib/api/error-handler.ts (error formatting)
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
    public url?: string,
    public method?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isTimeout() { return this.status === 408; }
  get isNetworkError() { return this.status === 0 || this.status === 503; }
  get isValidation() { return this.status === 422; }
  get isAuth() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  get isNotFound() { return this.status === 404; }
  get isTooManyRequests() { return this.status === 429; }

  get detail(): string | undefined {
    if (this.data && typeof this.data === 'object') {
      const obj = this.data as Record<string, unknown>;
      if (typeof obj.detail === 'string') return obj.detail;
    }
    return undefined;
  }
}

export function extractErrorMessage(data: unknown): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    if (Array.isArray(obj.detail) && obj.detail[0]?.msg) {
      return obj.detail[0].msg;
    }
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
  }
  return 'Request failed';
}
