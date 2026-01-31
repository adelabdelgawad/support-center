/**
 * Unified Error Handler for Next.js API Routes
 *
 * Provides consistent error response format across all API routes.
 * Uses formatApiError from error-handler.ts internally.
 *
 * Standard error response format:
 * {
 *   error: string;      // Context/operation that failed
 *   detail: string;     // Human-readable error message
 *   status?: number;    // HTTP status code (also in response status)
 * }
 */

import { NextResponse } from 'next/server';
import { formatApiError, logError } from './error-handler';

/**
 * Standard API error response interface
 */
export interface APIRouteErrorResponse {
  error: string;
  detail: string;
  status?: number;
}

/**
 * Handle errors in API routes and return a consistent NextResponse
 *
 * @param error - The caught error (can be ApiError, Error, or unknown)
 * @param context - Description of the operation that failed (e.g., "Create Note", "Fetch Users")
 * @param options - Optional configuration
 * @returns NextResponse with consistent error format
 *
 * @example
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   try {
 *     const body = await request.json();
 *     const response = await makeAuthenticatedRequest('POST', '/resource', body);
 *     return NextResponse.json(response, { status: 201 });
 *   } catch (error) {
 *     return handleRouteError(error, 'Create Resource');
 *   }
 * }
 * ```
 */
export function handleRouteError(
  error: unknown,
  context: string,
  options?: {
    /** Whether to log the error (default: true) */
    log?: boolean;
    /** Override the HTTP status code */
    statusOverride?: number;
  }
): NextResponse<APIRouteErrorResponse> {
  const { log = true, statusOverride } = options || {};

  // Log the error if enabled
  if (log) {
    logError(error, context);
  }

  // Format the error using existing utility
  const formatted = formatApiError(error);

  // Determine final status code
  const status = statusOverride || formatted.status || 500;

  return NextResponse.json(
    {
      error: context,
      detail: formatted.message,
      status,
    },
    { status }
  );
}

/**
 * Create a validation error response
 *
 * @param field - Field that failed validation
 * @param message - Validation error message
 * @returns NextResponse with 400 status
 *
 * @example
 * ```typescript
 * if (!body.title) {
 *   return validationError('title', 'Title is required');
 * }
 * ```
 */
export function validationError(
  field: string,
  message: string
): NextResponse<APIRouteErrorResponse> {
  return NextResponse.json(
    {
      error: 'Validation Error',
      detail: `${field}: ${message}`,
      status: 400,
    },
    { status: 400 }
  );
}

/**
 * Create a not found error response
 *
 * @param resource - Name of the resource that wasn't found
 * @returns NextResponse with 404 status
 *
 * @example
 * ```typescript
 * if (!user) {
 *   return notFoundError('User');
 * }
 * ```
 */
export function notFoundError(
  resource: string
): NextResponse<APIRouteErrorResponse> {
  return NextResponse.json(
    {
      error: 'Not Found',
      detail: `${resource} not found`,
      status: 404,
    },
    { status: 404 }
  );
}

/**
 * Create an unauthorized error response
 *
 * @param message - Optional custom message
 * @returns NextResponse with 401 status
 */
export function unauthorizedError(
  message = 'Authentication required'
): NextResponse<APIRouteErrorResponse> {
  return NextResponse.json(
    {
      error: 'Unauthorized',
      detail: message,
      status: 401,
    },
    { status: 401 }
  );
}

/**
 * Create a forbidden error response
 *
 * @param message - Optional custom message
 * @returns NextResponse with 403 status
 */
export function forbiddenError(
  message = 'You do not have permission to perform this action'
): NextResponse<APIRouteErrorResponse> {
  return NextResponse.json(
    {
      error: 'Forbidden',
      detail: message,
      status: 403,
    },
    { status: 403 }
  );
}

/**
 * Extract error status from caught error
 * Useful when you need just the status code
 */
export function getErrorStatus(error: unknown): number {
  const formatted = formatApiError(error);
  return formatted.status || 500;
}

/**
 * Extract error message from caught error
 * Useful when you need just the message
 */
export function getErrorDetail(error: unknown): string {
  const formatted = formatApiError(error);
  return formatted.message;
}
