"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Users, Wrench, UsersRound } from "lucide-react";
import { useCallback } from "react";

type UserType = "all" | "technicians" | "users";

interface UserTypeFilterProps {
  technicianCount?: number;
  userCount?: number;
  totalCount?: number;
}

/**
 * Filter buttons for user type: All, Technicians, Users
 * State is reflected in URL as ?user_type=all|technicians|users
 */
export function UserTypeFilter({
  technicianCount = 0,
  userCount = 0,
  totalCount = 0,
}: UserTypeFilterProps) {
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

  const filterOptions: { value: UserType; label: string; icon: typeof Users; count: number }[] = [
    { value: "all", label: "All", icon: UsersRound, count: totalCount },
    { value: "technicians", label: "Technicians", icon: Wrench, count: technicianCount },
    { value: "users", label: "Users", icon: Users, count: userCount },
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
