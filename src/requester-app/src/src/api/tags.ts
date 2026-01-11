/**
 * Tags API
 *
 * This module handles tag operations for request classification.
 *
 * Endpoints used:
 * - GET /tags - List all active tags with optional filtering
 * - GET /tags/:id - Get single tag details
 */

import apiClient, { getErrorMessage } from "./client";
import type { Tag } from "@/types";

/**
 * Get list of active tags for request classification
 * @param activeOnly - Only return active tags (default: true)
 * @param categoryId - Optional: Filter tags by category ID
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns List of tags
 */
export async function getTags(
  activeOnly: boolean = true,
  categoryId?: number,
  signal?: AbortSignal
): Promise<Tag[]> {
  try {
    const response = await apiClient.get<Tag[]>(
      "/tags",
      {
        params: {
          active_only: activeOnly,
          ...(categoryId && { category_id: categoryId }),
        },
        signal,
      }
    );
    return response.data;
  } catch (error) {
    if ((error as any).name === "AbortError" || (error as any).name === "CanceledError") {
      throw error;
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get a single tag by ID
 * @param tagId - The ID of the tag to fetch
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns The tag details
 */
export async function getTagById(
  tagId: number,
  signal?: AbortSignal
): Promise<Tag> {
  try {
    const response = await apiClient.get<Tag>(
      `/tags/${tagId}`,
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
