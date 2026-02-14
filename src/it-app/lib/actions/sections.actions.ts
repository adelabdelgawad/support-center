"use server";

import { serverGet } from "@/lib/fetch/server";
import type { Section } from "@/lib/api/sections";

/**
 * Fetches all service sections
 * @param onlyActive - Filter for active sections only (default: true)
 * @param onlyShown - Filter for sections shown in new request form (default: false)
 * @param includeTechnicians - Include technician assignments for each section (default: false)
 */
export async function getSections(
  onlyActive: boolean = true,
  onlyShown: boolean = false,
  includeTechnicians: boolean = false
): Promise<Section[]> {
  const params = new URLSearchParams();
  params.append("only_active", String(onlyActive));
  params.append("only_shown", String(onlyShown));
  params.append("include_technicians", String(includeTechnicians));

  // Backend returns a direct array of sections
  return serverGet<Section[]>(
    `/sections?${params.toString()}`
  );
}
