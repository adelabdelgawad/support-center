"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { RoleResponse } from "@/types/roles";

interface MobileRoleFilterProps {
  roles: RoleResponse[];
  // Scoped role counts (filtered by User Type AND Status)
  roleCounts?: Record<string, number>;
}

// Array of colors for roles (cycling through them)
const ROLE_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-red-100 text-red-700 border-red-200",
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-pink-100 text-pink-700 border-pink-200",
  "bg-orange-100 text-orange-700 border-orange-200",
];

/**
 * Mobile-optimized role filter using small cards/badges
 * Touch-friendly with minimum 44px tap targets
 */
export function MobileRoleFilter({
  roles,
  roleCounts = {},
}: MobileRoleFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRole = searchParams?.get("role");

  const handleRoleClick = useCallback(
    (roleId: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      if (currentRole === roleId) {
        // Toggle off if already selected
        params.delete("role");
      } else {
        // Select new role
        params.set("role", roleId);
      }

      // Reset to page 1 when filter changes
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, currentRole]
  );

  if (!roles || roles.length === 0) {
    return null;
  }

  return (
    <div className="px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground mb-2">Roles</div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {roles.map((role, index) => {
          const isSelected = currentRole === role.id;
          const colorIndex = index % ROLE_COLORS.length;
          const colorClass = ROLE_COLORS[colorIndex];
          // Use scoped count from roleCounts (filtered by User Type AND Status)
          const count = roleCounts[role.id] ?? 0;

          return (
            <Badge
              key={role.id}
              variant="outline"
              onClick={() => handleRoleClick(role.id)}
              className={cn(
                "min-h-[32px] px-3 py-1 cursor-pointer transition-all text-xs font-medium shrink-0 whitespace-nowrap",
                isSelected
                  ? "ring-2 ring-primary ring-offset-1 bg-primary text-primary-foreground border-primary"
                  : colorClass
              )}
            >
              {role.name}
              <span
                className={cn(
                  "ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full",
                  isSelected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-black/10"
                )}
              >
                {count}
              </span>
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
