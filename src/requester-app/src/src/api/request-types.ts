/**
 * Request Types API
 *
 * This module handles request type operations for request classification.
 *
 * Endpoints used:
 * - GET /request-types - List all active request types with optional filtering
 * - GET /request-types/:id - Get single request type details
 */

import apiClient, { getErrorMessage } from "./client";
import type { RequestType } from "@/types";

/**
 * Get list of active request types for request classification
 * @param activeOnly - Only return active request types (default: true)
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns List of request types
 */
export async function getRequestTypes(
  activeOnly: boolean = true,
  signal?: AbortSignal
): Promise<RequestType[]> {
  console.log('[request-types] Fetching request types, activeOnly:', activeOnly);

  try {
    const params = new URLSearchParams();
    if (activeOnly) {
      params.append("is_active", "true");
    }
    params.append("per_page", "100"); // Get all types in one request

    const endpoint = `/request-types?${params.toString()}`;
    console.log('[request-types] Calling endpoint:', endpoint);

    const response = await apiClient.get<{ types: RequestType[] }>(
      endpoint,
      { signal }
    );

    console.log('[request-types] Response received, types count:', response.data.types?.length);
    return response.data.types;
  } catch (error) {
    console.error('[request-types] Error fetching request types:', {
      error,
      errorType: typeof error,
      errorConstructor: (error as any)?.constructor?.name,
      errorMessage: (error as any)?.message,
      errorName: (error as any)?.name,
      errorStack: (error as any)?.stack,
    });

    if ((error as any).name === "AbortError" || (error as any).name === "CanceledError") {
      throw error;
    }

    const errorMsg = getErrorMessage(error);
    console.error('[request-types] Extracted error message:', errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Get a single request type by ID
 * @param typeId - The ID of the request type to fetch
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns The request type details
 */
export async function getRequestTypeById(
  typeId: number,
  signal?: AbortSignal
): Promise<RequestType> {
  try {
    const response = await apiClient.get<RequestType>(
      `/request-types/${typeId}`,
      { signal }
    );
    return response.data;
  } catch (error) {
    if ((error as any).name === "AbortError" || (error as any).name === "CanceledError") {
      throw error;
    }
    throw new Error(getErrorMessage(error));
  }
}
