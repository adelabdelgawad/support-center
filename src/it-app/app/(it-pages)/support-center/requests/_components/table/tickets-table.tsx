"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  TechnicianViewsConsolidatedResponse,
  TicketListItem,
  ViewType,
} from "@/lib/types/api/requests";
import { VIEW_DISPLAY_NAMES, VIEW_TO_COUNTS_KEY } from "@/lib/types/api/requests";
import { TicketsActionsProvider } from "../../context/tickets-actions-context";
import { Pagination } from "@/components/data-table/table/pagination";
import { TicketsTableBody } from "./tickets-table-body";

interface TicketsTableProps {
  initialData: TechnicianViewsConsolidatedResponse;
  visibleViews: ViewType[];
  defaultView?: ViewType;
  initialView?: ViewType;
  initialPage?: number;
  initialPerPage?: number;
  initialBusinessUnitIds?: number[];
}

export function TicketsTable({
  initialData,
  visibleViews,
  defaultView = "unassigned",
  initialView = "unassigned",
}: TicketsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read pagination from URL params directly (like users page) to avoid hydration flash
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");

  // Local state synced with server-fetched initialData
  const [data, setData] = useState<TechnicianViewsConsolidatedResponse>(initialData);

  // Sync state when initialData changes (URL param changes trigger server re-fetch)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Update helper: replaces items by ID from backend response
  const updateTickets = useCallback(async (serverResponse: TicketListItem[]) => {
    const currentData = data;
    if (!currentData) return;

    const responseMap = new Map(serverResponse.map((ticket) => [ticket.id, ticket]));
    const updatedList = currentData.data.map((ticket) =>
      responseMap.has(ticket.id) ? responseMap.get(ticket.id)! : ticket
    );

    setData({
      ...currentData,
      data: updatedList,
    });
  }, [data]);

  // Manual refresh function (triggers server component re-render)
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Actions for context provider
  const actions = {
    updateTickets,
    onRefresh: handleRefresh,
  };

  const tickets = data.data;
  const totalCount = data.total;
  const totalPages = Math.ceil(totalCount / limit);

  // Map view counts to view filter items
  const viewItems = useMemo(() => {
    return visibleViews.map((view) => ({
      key: view,
      name: VIEW_DISPLAY_NAMES[view] || view,
      count: data.counts[VIEW_TO_COUNTS_KEY[view]] || 0,
    }));
  }, [visibleViews, data.counts]);

  return (
    <TicketsActionsProvider actions={actions}>
      <div className="flex flex-col h-full min-h-0">
        {/* Table Body (includes toolbar + DataTable) */}
        <div className="flex-1 min-h-0">
          <TicketsTableBody
            tickets={tickets}
            page={page}
            perPage={limit}
            total={totalCount}
            updateTickets={updateTickets}
            onRefresh={handleRefresh}
            viewItems={viewItems}
            activeViewKey={initialView}
            allCount={data.counts.allTickets}
            myCount={data.counts.allYourRequests}
            businessUnits={data.businessUnits}
          />
        </div>

        {/* Pagination */}
        <div className="shrink-0 border-t border-border">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={limit}
            totalItems={totalCount}
          />
        </div>
      </div>
    </TicketsActionsProvider>
  );
}

export default TicketsTable;
