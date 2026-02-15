"use server";

import { serverGet } from "@/lib/fetch/server";
import { _handleApiError as handleApiError } from "@/lib/utils/api-errors";
import type {
  TechnicianViewsConsolidatedResponse,
  ViewType,
} from "@/lib/types/api/requests";

/**
 * Fetch technician views consolidated data
 * Combines tickets data + view counts + business unit counts in one response
 *
 * @param view - View type filter (unassigned, all_unsolved, etc.)
 * @param page - Page number (1-indexed)
 * @param perPage - Items per page
 * @param businessUnitIds - Optional business unit IDs to filter by
 * @param assignedToMe - When true, only show requests assigned to current technician
 * @returns Consolidated response with tickets, counts, and business units
 */
export async function getTicketsConsolidated(
  view: ViewType = "unassigned",
  page: number = 1,
  perPage: number = 20,
  businessUnitIds?: number[],
  assignedToMe?: boolean
): Promise<TechnicianViewsConsolidatedResponse> {
  try {
    const params = new URLSearchParams();
    params.append("view", view);
    params.append("page", page.toString());
    params.append("per_page", perPage.toString());

    if (businessUnitIds && businessUnitIds.length > 0) {
      businessUnitIds.forEach((id) => {
        params.append("business_unit_ids", id.toString());
      });
    }

    if (assignedToMe) {
      params.append("assigned_to_me", "true");
    }

    const response = await serverGet<TechnicianViewsConsolidatedResponse>(
      `/requests/technician-views-consolidated?${params.toString()}`
    );

    return response;
  } catch (error) {
    handleApiError("fetch consolidated tickets", error);
    throw error;
  }
}
