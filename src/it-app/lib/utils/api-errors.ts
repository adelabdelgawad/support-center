/**
 * Centralized API Error Handling Utility
 * Provides consistent error messaging, logging, and user feedback across the application
 */

import { ServerFetchError } from "@/lib/api/server-fetch";

export interface ApiErrorResponse {
  detail?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ApiErrorOptions {
  /** Custom logger function (defaults to console.error) */
  logger?: (message: string, error: unknown) => void;
  /** Whether to include original error in thrown error message */
  includeOriginalError?: boolean;
  /** Default error message to use if no specific message found */
  defaultMessage?: string;
}

/**
 * Enhanced error handler for API operations with consistent error messaging
 *
 * @param operation - Description of the operation that failed (e.g., "create asset", "fetch users")
 * @param error - The error object caught from API call
 * @param options - Configuration options for error handling
 * @returns Never returns (always throws)
 */
export function _handleApiError(
  operation: string,
  error: unknown,
  options: ApiErrorOptions = {}
): never {
  const {
    logger = console.error,
    includeOriginalError = false,
    defaultMessage = `Failed to ${operation.toLowerCase()}`
  } = options;

  // Log the error with operation context
  logger(`API Error - ${operation}:`, error);

  let errorMessage = defaultMessage;

  // Handle ServerFetchError
  if (error instanceof ServerFetchError) {
    // Use detail if available, otherwise message
    if (error.detail) {
      errorMessage = error.detail;
    } else if (error.message) {
      errorMessage = error.message;
    }
  }
  // Handle generic Error objects
  else if (error instanceof Error) {
    errorMessage = error.message;
  }
  // Handle unknown error types
  else if (typeof error === 'string') {
    errorMessage = error;
  }

  // Optionally include original error details for debugging
  if (includeOriginalError && error instanceof Error) {
    errorMessage += ` (Original: ${error.message})`;
  }

  throw new Error(errorMessage);
}

/**
 * Specialized error handler for network-related errors
 * Provides more specific messaging for network issues
 */
export function handleNetworkError(
  operation: string,
  error: unknown,
  options: ApiErrorOptions = {}
): never {
  if (error instanceof ServerFetchError) {
    if (error.detail === 'connection_refused') {
      // Network error (no response)
      const message = `Network error while ${operation.toLowerCase()}. Please check your connection.`;
      throw new Error(message);
    }

    if (error.detail === 'timeout') {
      const message = `Request timeout while ${operation.toLowerCase()}. Please try again.`;
      throw new Error(message);
    }
  }

  // Fall back to general error handling
  return _handleApiError(operation, error, options);
}

/**
 * Error handler for authentication/authorization errors
 * Provides specific messaging for auth issues
 */
export function handleAuthError(
  operation: string,
  error: unknown,
  options: ApiErrorOptions = {}
): never {
  if (error instanceof ServerFetchError && error.status === 401) {
    const message = "Authentication required. Please log in again.";
    throw new Error(message);
  }

  if (error instanceof ServerFetchError && error.status === 403) {
    const message = "You don't have permission to perform this action.";
    throw new Error(message);
  }

  // Fall back to general error handling
  return _handleApiError(operation, error, options);
}

/**
 * Error handler for validation errors
 * Provides specific messaging for validation issues
 */
export function handleValidationError(
  operation: string,
  error: unknown,
  options: ApiErrorOptions = {}
): never {
  if (error instanceof ServerFetchError && error.status === 422) {
    let message = "Validation error";

    if (error.detail) {
      message = typeof error.detail === 'string'
        ? error.detail
        : "Please check your input data";
    }

    throw new Error(message);
  }

  // Fall back to general error handling
  return _handleApiError(operation, error, options);
}

/**
 * Creates a specialized error handler function for consistent use in API modules
 */
export function createApiErrorHandler(operationType: string) {
  return (error: unknown) => _handleApiError(operationType, error);
}

/**
 * Validates if an error is an API error with a specific status code
 */
export function isApiErrorWithStatus(error: unknown, status: number): error is ServerFetchError {
  return error instanceof ServerFetchError && error.status === status;
}

/**
 * Extracts error message from various error formats
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof ServerFetchError) {
    return error.detail || error.message || "Unknown error";
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return "An unknown error occurred";
}
