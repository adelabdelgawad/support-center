"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";

interface MobileStatusFilterProps {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

export function MobileStatusFilter({
  activeCount,
  inactiveCount,
  totalCount,
}: MobileStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentFilter = searchParams?.get("is_active") || "";

  const handleFilterChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (value) {
        params.set("is_active", value);
      } else {
        params.delete("is_active");
      }
      params.set("page", "1");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [searchParams, pathname, router]
  );

  const filters = [
    { value: "", label: "All", count: totalCount },
    { value: "true", label: "Active", count: activeCount },
    { value: "false", label: "Inactive", count: inactiveCount },
  ];

  return (
    <div className="px-2">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => handleFilterChange(filter.value)}
            disabled={isPending}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              currentFilter === filter.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            )}
          >
            {filter.label}
            <span className="opacity-70">({filter.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
