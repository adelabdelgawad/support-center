/**
 * Filter Bar Component
 *
 * Displays filter buttons for:
 * 1. Request Status (All + dynamic status buttons)
 * 2. Chat Status (All + Unread)
 */

import { For, Show } from "solid-js";
import { Loader2 } from "lucide-solid";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/language-context";
import type { RequestStatusCount, TicketFilterParams } from "@/types";

interface FilterBarProps {
  requestStatuses: RequestStatusCount[];
  currentFilters: TicketFilterParams;
  totalCount: number;
  filteredTotalCount: number;
  unreadCount: number;
  isLoading?: boolean;
  onFilterChange: (filters: TicketFilterParams) => void;
}

interface FilterButtonProps {
  label: string;
  count: number;
  isActive: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function FilterButton(props: FilterButtonProps) {
  const isDisabled = () => props.disabled || props.count === 0;

  return (
    <button
      onClick={props.onClick}
      disabled={isDisabled()}
      class={cn(
        "flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium transition-all duration-200",
        "border",
        props.isActive
          ? "bg-accent text-accent-foreground border-accent shadow-sm"
          : "bg-secondary text-foreground border-border hover:bg-secondary/80",
        isDisabled() && "opacity-50 cursor-not-allowed hover:bg-secondary hover:text-foreground"
      )}
      style={{
        cursor: isDisabled() ? "not-allowed" : "pointer",
      }}
    >
      <span>{props.label}</span>
      <span
        class={cn(
          "px-1.5 py-0.5 rounded-full text-xs font-bold",
          props.isActive
            ? "bg-white/20 text-white"
            : "bg-foreground/10 text-foreground"
        )}
      >
        {props.count}
      </span>
    </button>
  );
}

export function FilterBar(props: FilterBarProps) {
  const { t, language } = useLanguage();

  // Get localized status name based on current language
  const getStatusName = (status: RequestStatusCount) => {
    return language() === "ar" ? status.nameAr : status.nameEn;
  };

  // Handle status filter toggle
  const handleStatusToggle = (statusId?: number) => {
    props.onFilterChange({
      ...props.currentFilters,
      statusFilter: statusId,
    });
  };

  // Handle read filter toggle
  const handleReadToggle = (filter?: "unread") => {
    props.onFilterChange({
      ...props.currentFilters,
      readFilter: filter,
    });
  };

  return (
    <div class="space-y-2.5">
      {/* Request Status Filters */}
      <div>
        <p class="text-xs mb-1 uppercase tracking-wide text-muted-foreground font-medium text-start flex items-center gap-1.5">
          {t("filter.status")}
          <Show when={props.isLoading}>
            <Loader2 class="h-3 w-3 animate-spin text-muted-foreground/70" />
          </Show>
        </p>
        <div class="flex flex-wrap gap-1.5">
          {/* All Status Button */}
          <FilterButton
            label={t("filter.all")}
            count={props.totalCount}
            isActive={props.currentFilters.statusFilter === undefined}
            onClick={() => handleStatusToggle(undefined)}
          />

          {/* Dynamic Status Buttons */}
          <For each={props.requestStatuses}>
            {(status) => (
              <FilterButton
                label={getStatusName(status)}
                count={status.count}
                isActive={props.currentFilters.statusFilter === status.id}
                onClick={() => handleStatusToggle(status.id)}
              />
            )}
          </For>
        </div>
      </div>

      {/* Chat Status Filters */}
      <div>
        <p class="text-xs mb-1 uppercase tracking-wide text-muted-foreground font-medium text-start flex items-center gap-1.5">
          {t("filter.messages")}
          <Show when={props.isLoading}>
            <Loader2 class="h-3 w-3 animate-spin text-muted-foreground/70" />
          </Show>
        </p>
        <div class="flex gap-1.5">
          {/* All Messages Button */}
          <FilterButton
            label={t("filter.all")}
            count={props.filteredTotalCount}
            isActive={props.currentFilters.readFilter === undefined}
            onClick={() => handleReadToggle(undefined)}
          />

          {/* Unread Button */}
          <FilterButton
            label={t("filter.unread")}
            count={props.unreadCount}
            isActive={props.currentFilters.readFilter === "unread"}
            onClick={() => handleReadToggle("unread")}
          />
        </div>
      </div>
    </div>
  );
}

export default FilterBar;
