"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";

interface MobileVersionFilterProps {
  versionMetrics: {
    total: number;
    ok: number;
    outdated: number;
    outdatedEnforced: number;
    unknown: number;
  };
}

export function MobileVersionFilter({ versionMetrics }: MobileVersionFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentFilter = searchParams?.get("version_status") || "";

  const handleFilterChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (value) {
        params.set("version_status", value);
      } else {
        params.delete("version_status");
      }
      params.set("page", "1");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [searchParams, pathname, router]
  );

  const filters = [
    { value: "", label: "All", count: versionMetrics.total, icon: null, color: "" },
    { value: "ok", label: "OK", count: versionMetrics.ok, icon: CheckCircle2, color: "text-green-500" },
    { value: "outdated", label: "Outdated", count: versionMetrics.outdated, icon: AlertTriangle, color: "text-yellow-500" },
    { value: "outdated_enforced", label: "Enforced", count: versionMetrics.outdatedEnforced, icon: AlertCircle, color: "text-red-500" },
    { value: "unknown", label: "Unknown", count: versionMetrics.unknown, icon: HelpCircle, color: "text-gray-500" },
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
            {filter.icon && <filter.icon className={cn("h-3 w-3", currentFilter !== filter.value && filter.color)} />}
            {filter.label}
            <span className="opacity-70">({filter.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
