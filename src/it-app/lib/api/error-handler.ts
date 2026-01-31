/**
 * Central Error Handler for API Errors
 * Provides readable error messages from ApiError responses
 */

import { ApiError } from '@/lib/fetch/errors';

export interface APIErrorDetail {
  field?: string;
  message: string;
  type?: string;
}

export interface APIErrorResponse {
  status: number;
  statusText: string;
  message: string;
  details: APIErrorDetail[];
  url?: string;
  method?: string;
  timestamp: string;
}

/**
 * Extract and format error details from ApiError
 */
export function formatApiError(error: unknown): APIErrorResponse {
  const timestamp = new Date().toISOString();

  // Not a ApiError
  if (!(error instanceof ApiError)) {
    return {
      status: 500,
      statusText: 'Internal Error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      details: [],
      timestamp,
    };
  }

  const fetchError = error;
  const status = fetchError.status;

  // Connection/Network error
  if (fetchError.detail === 'connection_refused') {
    return {
      status: 503,
      statusText: 'Network Error',
      message: 'Unable to reach the server. Please check your internet connection.',
      details: [
        {
          message: 'No response received from server',
          type: 'network_error',
        },
      ],
      url: fetchError.url,
      method: fetchError.method,
      timestamp,
    };
  }

  // Request timeout
  if (fetchError.detail === 'timeout') {
    return {
      status: 504,
      statusText: 'Request Timeout',
      message: 'The request took too long to complete.',
      details: [
        {
          message: 'Request timeout',
          type: 'timeout',
        },
      ],
      url: fetchError.url,
      method: fetchError.method,
      timestamp,
    };
  }

  // Get user-friendly message
  const message = fetchError.detail || fetchError.message || extractDefaultMessage(status);

  // Try to parse validation errors if the detail looks like JSON
  let details: APIErrorDetail[] = [];
  if (status === 422 && fetchError.detail) {
    try {
      // Detail might be a stringified validation error array
      const parsed = typeof fetchError.detail === 'string' && fetchError.detail.startsWith('[')
        ? JSON.parse(fetchError.detail)
        : null;
      if (Array.isArray(parsed)) {
        details = parseValidationErrors(parsed);
      }
    } catch {
      // Not JSON, use as message
      details = [{ message: fetchError.detail, type: 'validation_error' }];
    }
  }

  return {
    status,
    statusText: getStatusText(status),
    message,
    details,
    url: fetchError.url,
    method: fetchError.method,
    timestamp,
  };
}

/**
 * Get status text from status code
 */
function getStatusText(status: number): string {
  switch (status) {
    case 400: return 'Bad Request';
    case 401: return 'Unauthorized';
    case 403: return 'Forbidden';
    case 404: return 'Not Found';
    case 422: return 'Validation Error';
    case 429: return 'Too Many Requests';
    case 500: return 'Internal Server Error';
    case 502: return 'Bad Gateway';
    case 503: return 'Service Unavailable';
    case 504: return 'Gateway Timeout';
    default: return 'Error';
  }
}

/**
 * Get default message based on status code
 */
function extractDefaultMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Bad request - The request was invalid';
    case 401:
      return 'Unauthorized - Please log in';
    case 403:
      return 'Forbidden - You do not have permission';
    case 404:
      return 'Not found - The requested resource was not found';
    case 422:
      return 'Validation error - The request data is invalid';
    case 429:
      return 'Too many requests - Please try again later';
    case 500:
      return 'Server error - Something went wrong on the server';
    case 502:
      return 'Bad gateway - The server is temporarily unavailable';
    case 503:
      return 'Service unavailable - The server is temporarily down';
    case 504:
      return 'Gateway timeout - The server took too long to respond';
    default:
      return `Request failed with status ${status}`;
  }
}

/**
 * Parse FastAPI validation errors
 */
function parseValidationErrors(detail: unknown): APIErrorDetail[] {
  if (Array.isArray(detail)) {
    return detail.map((err) => {
      const errorObj = err as Record<string, unknown>;
      return {
        field: Array.isArray(errorObj.loc) ? errorObj.loc.join('.') : undefined,
        message: (errorObj.msg as string) || (errorObj.message as string) || 'Validation error',
        type: (errorObj.type as string) || 'validation_error',
      };
    });
  }

  if (typeof detail === 'string') {
    return [{ message: detail, type: 'validation_error' }];
  }

  if (typeof detail === 'object' && detail !== null) {
    const detailObj = detail as Record<string, unknown>;
    if (detailObj.message || detailObj.msg) {
      return [
        {
          field: detailObj.field as string | undefined,
          message: (detailObj.message as string) || (detailObj.msg as string) || 'Validation error',
          type: (detailObj.type as string) || 'validation_error',
        },
      ];
    }
  }

  return [{ message: 'Validation failed', type: 'validation_error' }];
}

/**
 * Format error for logging
 */
export function logError(error: unknown, context?: string): void {
  const formatted = formatApiError(error);

  console.error(`${context || 'API Error'}:`, {
    status: formatted.status,
    message: formatted.message,
    url: formatted.url,
    method: formatted.method,
    details: formatted.details,
    timestamp: formatted.timestamp,
  });

  // Log validation errors in detail
  if (formatted.details.length > 0) {
    console.error('Error Details:');
    formatted.details.forEach((detail, index) => {
      console.error(`  ${index + 1}. ${detail.field ? `[${detail.field}]` : ''} ${detail.message}`);
    });
  }
}

/**
 * Get user-friendly error message
 */
export function getUserErrorMessage(error: unknown): string {
  const formatted = formatApiError(error);

  // For validation errors, show the first field error
  if (formatted.details.length > 0) {
    const firstError = formatted.details[0];
    if (firstError.field) {
      return `${firstError.field}: ${firstError.message}`;
    }
    return firstError.message;
  }

  return formatted.message;
}

/**
 * Check if error is a specific status code
 */
export function isErrorStatus(error: unknown, status: number): boolean {
  if (error instanceof ApiError) {
    return error.status === status;
  }
  return false;
}

/**
 * Check if error is a validation error (422)
 */
export function isValidationError(error: unknown): boolean {
  return isErrorStatus(error, 422);
}

/**
 * Check if error is an authentication error (401)
 */
export function isAuthError(error: unknown): boolean {
  return isErrorStatus(error, 401);
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.detail === 'connection_refused' || error.status === 503;
  }
  return false;
}
