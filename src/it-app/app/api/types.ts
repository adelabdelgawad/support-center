/**
 * Type for API error responses
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
 */
export function handleServerFetchError(error: unknown): { detail: string; status: number } {
  const apiError = error as ServerFetchError;
  return {
    detail: apiError.response?.data?.detail || apiError.message || "An error occurred",
    status: apiError.response?.status || 500,
  };
}
