"use client";

/**
 * Horizontal Top Navigation Bar
 *
 * THEME-AWARE: Uses CSS variables for consistent theming across light/dark modes
 * - Header background: --sdp-header-bg (dark gray)
 * - Header foreground: --sdp-header-fg (white)
 * - Border: --border (adaptive based on theme)
 */

import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import { TopbarNavLinks } from "./topbar-nav-links";
import { TopbarUserActions } from "./topbar-user-actions";

interface HorizontalTopbarProps {
  user: UserInfo;
  className?: string;
}

export function HorizontalTopbar({
  user,
  className,
}: HorizontalTopbarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 bg-[var(--sdp-header-bg)] text-[var(--sdp-header-fg)]",
        "border-b border-[var(--border)]",
        className
      )}
      style={{
        height: "64px",
        minHeight: "64px",
      }}
    >
      {/* Logo/Brand */}
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-lg hover:opacity-80 transition-opacity"
        >
          <span>Support Center</span>
        </Link>

        {/* Navigation Links */}
        <TopbarNavLinks />
      </div>

      {/* User Actions */}
      <TopbarUserActions user={user} />
    </header>
  );
}

import Link from "next/link";
