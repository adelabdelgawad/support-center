"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import type { RoleResponse } from "@/types/roles";

interface RoleFilterProps {
  options: RoleResponse[];
}

export const RoleFilter: React.FC<RoleFilterProps> = ({ options }) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentRole = searchParams?.get("role") || "";

  const handleRoleChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (value) {
      params.set("role", value);
    } else {
      params.delete("role");
    }
    params.set("page", "1"); // Reset to first page
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="relative flex items-center">
      <Shield className="absolute left-2 w-4 h-4 text-gray-500 pointer-events-none" />
      <select
        value={currentRole}
        onChange={(e) => handleRoleChange(e.target.value)}
        className="pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white appearance-none cursor-pointer"
      >
        <option value="">All Roles</option>
        {options.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-2 w-4 h-4 text-gray-500 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  );
};
