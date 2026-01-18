"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Circle, Wifi, WifiOff } from "lucide-react";
import { useCallback } from "react";

type OnlineStatusValue = "all" | "online" | "offline";

interface OnlineStatusFilterProps {
  onlineCount?: number;
  offlineCount?: number;
  totalCount?: number;
  queryParam?: string;
}

/**
 * Filter buttons for online status: All, Online, Offline
 * State is reflected in URL as ?status=all|online|offline
 */
export function OnlineStatusFilter({
  onlineCount = 0,
  offlineCount = 0,
  totalCount = 0,
  queryParam = "status",
}: OnlineStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current filter from URL, default to "all"
  const currentStatus = (searchParams?.get(queryParam) as OnlineStatusValue) || "all";

  const handleFilterChange = useCallback(
    (status: OnlineStatusValue) => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      if (status === "all") {
        params.delete(queryParam);
      } else {
        params.set(queryParam, status);
      }

      // Reset to page 1 when filter changes
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, queryParam]
  );

  const filterOptions: {
    value: OnlineStatusValue;
    label: string;
    icon: typeof Circle;
    count: number;
    color: string;
  }[] = [
    { value: "all", label: "All", icon: Circle, count: totalCount, color: "text-muted-foreground" },
    { value: "online", label: "Online", icon: Wifi, count: onlineCount, color: "text-green-500" },
    { value: "offline", label: "Offline", icon: WifiOff, count: offlineCount, color: "text-red-500" },
  ];

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
      {filterOptions.map((option) => {
        const Icon = option.icon;
        const isActive = currentStatus === option.value;

        return (
          <Button
            key={option.value}
            variant={isActive ? "default" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange(option.value)}
            className={`
              h-7 px-3 text-xs font-medium transition-all
              ${isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-transparent"
              }
            `}
          >
            <Icon className={`h-3.5 w-3.5 mr-1.5 ${isActive ? option.color : ""}`} />
            {option.label}
            <span
              className={`
                ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full
                ${isActive
                  ? "bg-primary/10 text-primary"
                  : "bg-muted-foreground/10 text-muted-foreground"
                }
              `}
            >
              {option.count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
