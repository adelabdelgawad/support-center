"use client";

import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/types/sessions";

interface SessionStatusBadgeProps {
  status: SessionStatus;
}

/**
 * Status badge with color coding
 * - active: green
 * - stale: yellow
 * - disconnected: red
 */
export function SessionStatusBadge({ status }: SessionStatusBadgeProps) {
  const variants = {
    active: "default" as const,
    stale: "secondary" as const,
    disconnected: "destructive" as const,
  };

  const colors = {
    active: "bg-green-500 hover:bg-green-600",
    stale: "bg-yellow-500 hover:bg-yellow-600",
    disconnected: "bg-red-500 hover:bg-red-600",
  };

  return (
    <Badge
      variant={variants[status]}
      className={`${colors[status]} text-white capitalize`}
    >
      {status}
    </Badge>
  );
}
