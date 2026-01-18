"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopbarAdminGearProps {
  className?: string;
}

export function TopbarAdminGear({ className }: TopbarAdminGearProps) {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/admin");

  return (
    <Link
      href="/admin"
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-md transition-colors",
        "hover:bg-white/10",
        isActive
          ? "bg-white/10 text-[var(--sdp-accent)]"
          : "text-gray-300 hover:text-white",
        className
      )}
      title="Admin Settings"
    >
      <Settings className="w-5 h-5" />
    </Link>
  );
}
