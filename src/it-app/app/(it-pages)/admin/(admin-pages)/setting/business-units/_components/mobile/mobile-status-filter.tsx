"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface MobileStatusFilterProps {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

/**
 * Mobile-optimized status filter
 * All / Active / Inactive segmented buttons with count badges
 * 44px minimum touch targets
 */
export function MobileStatusFilter({
  activeCount,
  inactiveCount,
  totalCount,
}: MobileStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActiveParam = searchParams?.get("is_active");
  const currentFilter = isActiveParam === "true" ? "active" : isActiveParam === "false" ? "inactive" : "all";

  const handleFilterChange = useCallback(
    (filter: "all" | "active" | "inactive") => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      // Update is_active parameter
      if (filter === "active") {
        params.set("is_active", "true");
      } else if (filter === "inactive") {
        params.set("is_active", "false");
      } else {
        params.delete("is_active");
      }

      // Reset to page 1
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="px-2">
      <div className="flex items-center gap-1 w-full">
        {/* All Button */}
        <Button
          variant={currentFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("all")}
          className={cn(
            "flex-1 min-h-[44px] gap-2 justify-center",
            currentFilter === "all" && "shadow-sm"
          )}
        >
          <span className="text-sm font-medium">All</span>
          <Badge
            variant={currentFilter === "all" ? "secondary" : "outline"}
            className="text-xs px-1.5 min-w-[20px] justify-center"
          >
            {totalCount}
          </Badge>
        </Button>

        {/* Active Button */}
        <Button
          variant={currentFilter === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("active")}
          className={cn(
            "flex-1 min-h-[44px] gap-2 justify-center",
            currentFilter === "active" && "shadow-sm"
          )}
        >
          <span className="text-sm font-medium">Active</span>
          <Badge
            variant={currentFilter === "active" ? "secondary" : "outline"}
            className="text-xs px-1.5 min-w-[20px] justify-center"
          >
            {activeCount}
          </Badge>
        </Button>

        {/* Inactive Button */}
        <Button
          variant={currentFilter === "inactive" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("inactive")}
          className={cn(
            "flex-1 min-h-[44px] gap-2 justify-center",
            currentFilter === "inactive" && "shadow-sm"
          )}
        >
          <span className="text-sm font-medium">Inactive</span>
          <Badge
            variant={currentFilter === "inactive" ? "secondary" : "outline"}
            className="text-xs px-1.5 min-w-[20px] justify-center"
          >
            {inactiveCount}
          </Badge>
        </Button>
      </div>
    </div>
  );
}
