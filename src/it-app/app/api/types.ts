/**
 * Type for API error responses
 * @deprecated Use ApiError from @/lib/fetch/errors instead
 */
export interface ServerFetchError {
  response?: {
    data?: {
      detail?: string;
    };
    status?: number;
  };
  message?: string;
}

/**
 * Helper function to extract error message and status from API error
 * @deprecated Use ApiError from @/lib/fetch/errors instead
 */
export function handleServerFetchError(error: unknown): { detail: string; status: number } {
  const apiError = error as ServerFetchError;
  return {
    detail: apiError.response?.data?.detail || apiError.message || "An error occurred",
    status: apiError.response?.status || 500,
  };
}
