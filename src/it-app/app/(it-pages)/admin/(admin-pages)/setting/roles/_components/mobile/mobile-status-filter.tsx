"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MobileStatusFilterProps {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

/**
 * Mobile-optimized status filter for roles
 * Segmented button group: All / Active / Inactive
 * Touch-friendly (≥44px) with count badges
 */
export function MobileStatusFilter({
  activeCount,
  inactiveCount,
  totalCount,
}: MobileStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current filter from URL
  const isActiveParam = searchParams?.get("is_active") || "";

  const handleFilterChange = useCallback(
    (status: "all" | "active" | "inactive") => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      // Update status filter
      if (status === "active") {
        params.set("is_active", "true");
      } else if (status === "inactive") {
        params.set("is_active", "false");
      } else {
        params.delete("is_active");
      }

      // Reset to page 1 when filter changes
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  // Determine active filter
  const activeFilter =
    isActiveParam === "true"
      ? "active"
      : isActiveParam === "false"
      ? "inactive"
      : "all";

  return (
    <div className="px-2">
      <div className="flex gap-2">
        {/* All Roles */}
        <Button
          variant={activeFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("all")}
          className={cn(
            "flex-1 min-h-[44px] font-medium",
            activeFilter === "all" && "pointer-events-none"
          )}
        >
          All
          <Badge
            variant={activeFilter === "all" ? "secondary" : "outline"}
            className="ml-2 text-xs"
          >
            {totalCount}
          </Badge>
        </Button>

        {/* Active Roles */}
        <Button
          variant={activeFilter === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("active")}
          className={cn(
            "flex-1 min-h-[44px] font-medium",
            activeFilter === "active" && "pointer-events-none"
          )}
        >
          Active
          <Badge
            variant={activeFilter === "active" ? "secondary" : "outline"}
            className="ml-2 text-xs"
          >
            {activeCount}
          </Badge>
        </Button>

        {/* Inactive Roles */}
        <Button
          variant={activeFilter === "inactive" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("inactive")}
          className={cn(
            "flex-1 min-h-[44px] font-medium",
            activeFilter === "inactive" && "pointer-events-none"
          )}
        >
          Inactive
          <Badge
            variant={activeFilter === "inactive" ? "secondary" : "outline"}
            className="ml-2 text-xs"
          >
            {inactiveCount}
          </Badge>
        </Button>
      </div>
    </div>
  );
}
