"use server";

import { serverGet } from "@/lib/fetch";
import type { ClientVersion, ClientVersionListResponse } from "@/types/client-versions";

/**
 * Fetch all client versions (server-side)
 * Returns data for SSR with SWR fallbackData pattern
 */
export async function getClientVersions(options?: {
  platform?: string;
  activeOnly?: boolean;
}): Promise<ClientVersionListResponse | null> {
  try {
    const params = new URLSearchParams();
    if (options?.platform) params.set("platform", options.platform);
    params.set("active_only", (options?.activeOnly ?? false).toString());

    const versions = await serverGet<ClientVersion[]>(
      `/client-versions?${params.toString()}`,
      { revalidate: 0 }
    );

    // Calculate counts
    const total = versions.length;
    const latestCount = versions.filter((v) => v.isLatest).length;
    const enforcedCount = versions.filter((v) => v.isEnforced).length;

    return {
      versions,
      total,
      latestCount,
      enforcedCount,
    };
  } catch (error) {
    console.error("Error fetching client versions:", error);
    return null;
  }
}
