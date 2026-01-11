"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { List, CheckCircle2, XCircle } from "lucide-react";
import { useCallback } from "react";

type StatusType = "all" | "active" | "inactive";

interface StatusFilterProps {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

export function StatusFilter({
  activeCount,
  inactiveCount,
  totalCount,
}: StatusFilterProps) {
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

      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const filterOptions: { value: StatusType; label: string; icon: typeof List; count: number }[] = [
    { value: "all", label: "All", icon: List, count: totalCount },
    { value: "active", label: "Active", icon: CheckCircle2, count: activeCount },
    { value: "inactive", label: "Inactive", icon: XCircle, count: inactiveCount },
  ];

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
      {filterOptions.map((option) => {
        const Icon = option.icon;
        const isActive = currentType === option.value;

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
            <Icon className="h-3.5 w-3.5 mr-1.5" />
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
