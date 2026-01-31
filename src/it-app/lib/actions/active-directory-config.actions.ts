"use server";

import { serverGet } from "@/lib/fetch";
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
  return serverGet<ActiveDirectoryConfigListResponse>(
    "/active-directory-configs"
  );
}

/**
 * Fetch active Active Directory configuration (server-side)
 */
export async function getActiveConfig(): Promise<ActiveDirectoryConfig | null> {
  try {
    return await serverGet<ActiveDirectoryConfig>(
      "/active-directory-configs/active"
    );
  } catch (error) {
    // Return null if no active config exists (404)
    return null;
  }
}
