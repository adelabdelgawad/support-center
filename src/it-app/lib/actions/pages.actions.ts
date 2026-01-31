"use server";

import { serverGet } from "@/lib/fetch/server";
import type { PageResponse } from "@/types/pages";

/**
 * Fetches all available pages for role assignment
 */
export async function getPages(): Promise<{ pages: PageResponse[]; total: number }> {
  try {
    // Fetch all active pages from the backend
    const pages = await serverGet<PageResponse[]>(
      "/pages?is_active=true&per_page=100"
    );

    return {
      pages: pages || [],
      total: pages?.length || 0,
    };
  } catch (error) {
    console.error("Failed to fetch pages:", error);
    return {
      pages: [],
      total: 0,
    };
  }
}
