"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Users, Wrench, UsersRound } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

type UserType = "all" | "technicians" | "users";

interface MobileUserFiltersProps {
  technicianCount?: number;
  userCount?: number;
  totalCount?: number;
}

/**
 * Mobile-optimized filter controls for user type
 * Touch-friendly segmented control (min 44px height)
 */
export function MobileUserFilters({
  technicianCount = 0,
  userCount = 0,
  totalCount = 0,
}: MobileUserFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current filter from URL, default to "all"
  const currentType = (searchParams?.get("user_type") as UserType) || "all";

  const handleFilterChange = useCallback(
    (type: UserType) => {
      // Reset ALL filters when User Type changes (primary filter)
      const params = new URLSearchParams();

      if (type !== "all") {
        params.set("user_type", type);
      }

      // Reset to page 1
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname]
  );

  const filterOptions: {
    value: UserType;
    label: string;
    icon: typeof Users;
    count: number;
  }[] = [
    { value: "all", label: "All", icon: UsersRound, count: totalCount },
    {
      value: "technicians",
      label: "Techs",
      icon: Wrench,
      count: technicianCount,
    },
    { value: "users", label: "Users", icon: Users, count: userCount },
  ];

  return (
    <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
      {filterOptions.map((option) => {
        const Icon = option.icon;
        const isActive = currentType === option.value;

        return (
          <Button
            key={option.value}
            variant={isActive ? "default" : "outline"}
            onClick={() => handleFilterChange(option.value)}
            className={cn(
              "min-h-[44px] flex-1 min-w-0 text-sm font-medium transition-all whitespace-nowrap",
              isActive && "shadow-md"
            )}
          >
            <Icon className="h-4 w-4 mr-1.5 shrink-0" />
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
