"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Monitor, CircleCheck, CircleX } from "lucide-react";
import { useCallback } from "react";

type SessionStatus = "all" | "true" | "false";

interface SessionStatusFilterProps {
  totalCount?: number;
  activeCount?: number;
  inactiveCount?: number;
}

/**
 * Filter buttons for session status: All, Active, Inactive
 * State is reflected in URL as ?is_active=all|true|false
 */
export function SessionStatusFilter({
  totalCount = 0,
  activeCount = 0,
  inactiveCount = 0,
}: SessionStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current filter from URL, default to "all"
  const currentStatus = (searchParams?.get("is_active") as SessionStatus) || "all";

  const handleFilterChange = useCallback(
    (status: SessionStatus) => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      if (status === "all") {
        params.delete("is_active");
      } else {
        params.set("is_active", status);
      }

      // Reset to page 1
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const filterOptions: { value: SessionStatus; label: string; icon: typeof Monitor; count: number }[] = [
    { value: "all", label: "All", icon: Monitor, count: totalCount },
    { value: "true", label: "Active", icon: CircleCheck, count: activeCount },
    { value: "false", label: "Inactive", icon: CircleX, count: inactiveCount },
  ];

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
      {filterOptions.map((option) => {
        const Icon = option.icon;
        const isActive = currentStatus === option.value;

        // Color based on status type
        const getCountColor = () => {
          if (!isActive) return "bg-muted-foreground/10 text-muted-foreground";
          switch (option.value) {
            case "true":
              return "bg-green-500/10 text-green-600 dark:text-green-400";
            case "false":
              return "bg-red-500/10 text-red-600 dark:text-red-400";
            default:
              return "bg-primary/10 text-primary";
          }
        };

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
                ${getCountColor()}
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
