/**
 * Retry configuration for handling transient failures
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatuses?: number[];
}

/**
 * Default retry configuration for token refresh
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2, // Double delay each attempt
  retryableStatuses: [502, 503, 504], // Gateway errors
};

/**
 * Retry an async operation with exponential backoff
 *
 * @param operation - The async function to retry
 * @param config - Retry configuration
 * @returns Promise resolving to the operation result
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error as Error;

      // Type guard for error with status (works with both ServerFetchError and generic errors)
      const errorWithStatus = error as { status?: number; detail?: string };

      // Check if error is retryable
      const isNetworkError = errorWithStatus.detail === 'connection_refused'; // Connection refused
      const isServerError = errorWithStatus.status ? errorWithStatus.status >= 500 : false;
      const isRetryableStatus = config.retryableStatuses?.includes(errorWithStatus.status || 0);

      const isRetryable = isNetworkError || isServerError || isRetryableStatus;

      // Don't retry on last attempt or non-retryable errors
      if (attempt === config.maxAttempts || !isRetryable) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError!;
}
