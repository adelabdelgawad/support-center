"use server";

import { internalGet } from "@/lib/fetch";
import type {
  ActiveDirectoryConfig,
  ActiveDirectoryConfigListResponse,
} from "@/types/active-directory-config";

/**
 * Fetch all Active Directory configurations (server-side)
 */
export async function getActiveDirectoryConfigs(): Promise<
  ActiveDirectoryConfigListResponse
> {
  return internalGet<ActiveDirectoryConfigListResponse>(
    "/api/active-directory-configs"
  );
}

/**
 * Fetch active Active Directory configuration (server-side)
 */
export async function getActiveConfig(): Promise<ActiveDirectoryConfig | null> {
  try {
    return await internalGet<ActiveDirectoryConfig>(
      "/api/active-directory-configs/active"
    );
  } catch (error) {
    // Return null if no active config exists (404)
    return null;
  }
}
