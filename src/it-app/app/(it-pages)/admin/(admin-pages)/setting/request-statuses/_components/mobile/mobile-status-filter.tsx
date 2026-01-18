"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { List, CheckCircle2, XCircle } from "lucide-react";
import { useCallback } from "react";

type StatusType = "all" | "active" | "inactive";

interface MobileStatusFilterProps {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

/**
 * Mobile-optimized status filter with touch-friendly buttons
 * Full width segmented buttons with count badges
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
  const currentStatus = searchParams?.get("is_active");
  const currentType: StatusType =
    currentStatus === "true" ? "active" :
    currentStatus === "false" ? "inactive" :
    "all";

  const handleFilterChange = useCallback(
    (type: StatusType) => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      // Reset page to 1 when changing filters
      params.set("page", "1");

      if (type === "all") {
        params.delete("is_active");
      } else if (type === "active") {
        params.set("is_active", "true");
      } else {
        params.set("is_active", "false");
      }

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const filterOptions: { value: StatusType; label: string; icon: typeof List; count: number }[] = [
    { value: "all", label: "All", icon: List, count: totalCount },
    { value: "active", label: "Active", icon: CheckCircle2, count: activeCount },
    { value: "inactive", label: "Inactive", icon: XCircle, count: inactiveCount },
  ];

  return (
    <div className="px-3 py-2">
      <div className="grid grid-cols-3 gap-2">
        {filterOptions.map((option) => {
          const Icon = option.icon;
          const isActive = currentType === option.value;

          return (
            <Button
              key={option.value}
              variant={isActive ? "default" : "outline"}
              onClick={() => handleFilterChange(option.value)}
              className="min-h-[44px] flex flex-col items-center justify-center gap-1 p-2"
            >
              <div className="flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-medium">{option.label}</span>
              </div>
              <span
                className={`
                  text-xs font-semibold
                  ${isActive ? "text-primary-foreground" : "text-muted-foreground"}
                `}
              >
                {option.count}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
