"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { StatusCircle } from "@/components/data-table";
import type { RoleResponse } from "@/types/roles";

interface RoleStatusFilterProps {
  roles: RoleResponse[];
  // Scoped role counts (filtered by User Type AND Status)
  roleCounts?: Record<string, number>;
}

// Array of colors for roles (cycling through them)
const ROLE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
];

export const RoleStatusFilter: React.FC<RoleStatusFilterProps> = ({
  roles,
  roleCounts = {},
}) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentRole = searchParams?.get("role");

  const handleRoleClick = (roleId: string) => {
    const params = new URLSearchParams(searchParams?.toString());

    if (currentRole === roleId) {
      // Toggle off if already selected
      params.delete("role");
    } else {
      // Select new role
      params.set("role", roleId);
    }

    params.set("page", "1"); // Reset to first page
    router.push(`${pathname}?${params.toString()}`);
  };

  if (!roles || roles.length === 0) {
    return (
      <div className="text-xs text-gray-500 text-center py-2">No roles available</div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="text-xs font-semibold text-gray-600 mb-3">Roles</div>
      <div className="flex flex-wrap gap-4 justify-center">
        {roles.map((role, index) => {
          const isSelected = currentRole === role.id;
          const colorIndex = index % ROLE_COLORS.length;
          const color = ROLE_COLORS[colorIndex];
          // Use scoped count from roleCounts (filtered by User Type AND Status)
          // Falls back to 0 if role not in current filtered data
          const count = roleCounts[role.id] ?? 0;

          return (
            <div
              key={role.id}
              onClick={() => handleRoleClick(role.id)}
              className={`transition-all transform cursor-pointer ${isSelected ? "scale-110 drop-shadow-lg" : "hover:scale-105"}`}
              title={`${role.name} - Click to filter`}
              style={{ userSelect: "none" }}
            >
              <div className="flex flex-col items-center gap-1" style={{ pointerEvents: "none" }}>
                <StatusCircle
                  count={count}
                  color={color}
                  label={role.name || "Unknown Role"}
                  size="sm"
                  showLabel={false}
                  showTooltip={false}
                />
                <span className={`text-xs font-medium ${isSelected ? "text-blue-600" : "text-gray-600"}`}>
                  {role.name || "Unknown Role"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
