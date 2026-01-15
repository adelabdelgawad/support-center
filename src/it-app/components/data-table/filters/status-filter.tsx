"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Circle, CheckCircle2, XCircle } from "lucide-react";
import { useCallback } from "react";

type StatusValue = "all" | "true" | "false";

interface StatusFilterProps {
  activeCount?: number;
  inactiveCount?: number;
  totalCount?: number;
  queryParam?: string;
}

/**
 * Filter buttons for status: All, Active, Inactive
 * State is reflected in URL as ?is_active=all|true|false
 */
export function StatusFilter({
  activeCount = 0,
  inactiveCount = 0,
  totalCount = 0,
  queryParam = "is_active",
}: StatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current filter from URL, default to "all"
  const currentStatus = (searchParams?.get(queryParam) as StatusValue) || "all";

  const handleFilterChange = useCallback(
    (status: StatusValue) => {
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
    value: StatusValue;
    label: string;
    icon: typeof Circle;
    count: number;
    color: string;
  }[] = [
    { value: "all", label: "All", icon: Circle, count: totalCount, color: "text-muted-foreground" },
    { value: "true", label: "Active", icon: CheckCircle2, count: activeCount, color: "text-green-500" },
    { value: "false", label: "Inactive", icon: XCircle, count: inactiveCount, color: "text-red-500" },
  ];

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
      {filterOptions.map((option) => {
        const IconComponent = option.icon;
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
            <IconComponent className={`h-3.5 w-3.5 mr-1.5 ${isActive ? option.color : ""}`} />
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
