"use client";

import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import { TopbarNavLinks } from "./topbar-nav-links";
import { TopbarUserActions } from "./topbar-user-actions";

interface HorizontalTopbarProps {
  user: UserInfo;
  notificationCount?: number;
  className?: string;
}

export function HorizontalTopbar({
  user,
  notificationCount = 0,
  className,
}: HorizontalTopbarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 bg-[var(--sdp-header-bg)] text-[var(--sdp-header-fg)]",
        "border-b border-gray-700",
        className
      )}
      style={{
        height: "48px",
        minHeight: "48px",
      }}
    >
      {/* Logo/Brand */}
      <div className="flex items-center gap-6">
        <Link
          href="/support-center"
          className="flex items-center gap-2 font-semibold text-lg"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded bg-[var(--sdp-accent)]">
            <span className="text-white font-bold text-sm">SD</span>
          </div>
          <span className="hidden sm:inline">ServiceDesk</span>
        </Link>

        {/* Navigation Links */}
        <TopbarNavLinks />
      </div>

      {/* User Actions */}
      <TopbarUserActions user={user} notificationCount={notificationCount} />
    </header>
  );
}

import Link from "next/link";
