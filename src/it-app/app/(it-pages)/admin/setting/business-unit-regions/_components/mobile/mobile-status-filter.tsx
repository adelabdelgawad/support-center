"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MapPin } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

type StatusType = "all" | "active" | "inactive";

interface MobileStatusFilterProps {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

/**
 * Mobile-optimized status filter for active/inactive regions
 * Segmented control with touch-friendly buttons (≥44px)
 */
export function MobileStatusFilter({
  activeCount,
  inactiveCount,
  totalCount,
}: MobileStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current status from URL (is_active param)
  const isActiveParam = searchParams?.get("is_active");
  const currentStatus: StatusType = isActiveParam === "true"
    ? "active"
    : isActiveParam === "false"
    ? "inactive"
    : "all";

  const handleStatusChange = useCallback(
    (status: StatusType) => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      if (status === "all") {
        // Remove filter when selecting "all"
        params.delete("is_active");
      } else if (status === "active") {
        params.set("is_active", "true");
      } else {
        params.set("is_active", "false");
      }

      // Reset to page 1 when filter changes
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const filterOptions: {
    value: StatusType;
    label: string;
    icon: typeof MapPin;
    count: number;
    color: string;
  }[] = [
    { value: "all", label: "All", icon: MapPin, count: totalCount, color: "text-gray-500" },
    { value: "active", label: "Active", icon: CheckCircle2, count: activeCount, color: "text-green-500" },
    { value: "inactive", label: "Inactive", icon: XCircle, count: inactiveCount, color: "text-destructive" },
  ];

  return (
    <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
      {filterOptions.map((option) => {
        const Icon = option.icon;
        const isActive = currentStatus === option.value;

        return (
          <Button
            key={option.value}
            variant={isActive ? "default" : "outline"}
            onClick={() => handleStatusChange(option.value)}
            className={cn(
              "min-h-[44px] flex-1 min-w-0 text-sm font-medium transition-all whitespace-nowrap",
              isActive && "shadow-md"
            )}
          >
            <Icon className={cn("h-4 w-4 mr-1.5 shrink-0", !isActive && option.color)} />
            <span className="truncate">{option.label}</span>
            <span
              className={cn(
                "ml-1.5 px-2 py-0.5 text-xs rounded-full shrink-0",
                isActive
                  ? "bg-background/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {option.count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
