"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { List, UserCheck } from "lucide-react";
import { useCallback } from "react";

type ScopeValue = "all" | "mine";

interface RequestScopeFilterProps {
  allCount: number;
  myCount: number;
}

/**
 * Scope filter for requests: All Requests / My Requests
 * Same toggle style as the users StatusFilter (All / Active / Inactive).
 *
 * Uses `assigned_to_me` URL param — independent from the `view` param.
 */
export function RequestScopeFilter({
  allCount,
  myCount,
}: RequestScopeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isMyRequests = searchParams?.get("assigned_to_me") === "true";
  const currentScope: ScopeValue = isMyRequests ? "mine" : "all";

  const handleScopeChange = useCallback(
    (scope: ScopeValue) => {
      if (scope === currentScope) return;

      const params = new URLSearchParams(searchParams?.toString() || "");

      if (scope === "mine") {
        params.set("assigned_to_me", "true");
      } else {
        params.delete("assigned_to_me");
      }

      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, currentScope]
  );

  const filterOptions: {
    value: ScopeValue;
    label: string;
    icon: typeof List;
    count: number;
    color: string;
  }[] = [
    { value: "all", label: "All Requests", icon: List, count: allCount, color: "text-muted-foreground" },
    { value: "mine", label: "My Requests", icon: UserCheck, count: myCount, color: "text-blue-500" },
  ];

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
      {filterOptions.map((option) => {
        const IconComponent = option.icon;
        const isActive = currentScope === option.value;

        return (
          <Button
            key={option.value}
            variant={isActive ? "default" : "ghost"}
            size="sm"
            onClick={() => handleScopeChange(option.value)}
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
