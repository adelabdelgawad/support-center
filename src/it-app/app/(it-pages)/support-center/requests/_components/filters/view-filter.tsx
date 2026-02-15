"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ListFilter } from "lucide-react";
import {
  Faceted,
  FacetedTrigger,
  FacetedContent,
  FacetedInput,
  FacetedList,
  FacetedEmpty,
  FacetedGroup,
  FacetedItem,
  FacetedBadgeList,
} from "@/components/data-table";

interface ViewFilterProps {
  viewItems: Array<{ key: string; name: string; count: number }>;
  /** The active view key (e.g. "unassigned") — used as default when URL has no view param */
  activeViewKey: string;
}

/**
 * View Filter using Faceted multi-select pattern.
 * Shows available views (Unassigned, All Unsolved, etc.) with counts.
 */
export function ViewFilter({ viewItems, activeViewKey }: ViewFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Current selected views — use URL param if present, otherwise fall back to active view key
  const currentViews = useMemo(() => {
    const param = searchParams?.get("view") || "";
    if (param) return param.split(",");
    // Default: show the active view as selected
    return [activeViewKey];
  }, [searchParams, activeViewKey]);

  const options = useMemo(
    () =>
      viewItems.map((item) => ({
        value: item.key,
        label: item.name,
        count: item.count,
      })),
    [viewItems]
  );

  const facetedOptions = useMemo(
    () => options.map(({ value, label }) => ({ value, label })),
    [options]
  );

  const handleChange = useCallback(
    (value: string[] | undefined) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams?.toString() || "");
        params.set("page", "1");
        // Reset scope to "All Requests" when changing views
        params.delete("assigned_to_me");

        if (value && value.length > 0) {
          params.set("view", value.join(","));
        } else {
          params.delete("view");
        }

        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [searchParams, pathname, router]
  );

  return (
    <Faceted multiple value={currentViews} onValueChange={handleChange}>
      <FacetedTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 border-dashed gap-1">
          <ListFilter className="size-4" />
          Views
          <FacetedBadgeList
            options={facetedOptions}
            max={2}
            placeholder=""
            selectedLabel="selected"
          />
        </Button>
      </FacetedTrigger>
      <FacetedContent>
        <FacetedInput placeholder="Search views..." />
        <FacetedList>
          <FacetedEmpty>No views found.</FacetedEmpty>
          <FacetedGroup>
            {options.map((option) => (
              <FacetedItem key={option.value} value={option.value}>
                <span>{option.label}</span>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                  {option.count}
                </span>
              </FacetedItem>
            ))}
          </FacetedGroup>
        </FacetedList>
      </FacetedContent>
    </Faceted>
  );
}
