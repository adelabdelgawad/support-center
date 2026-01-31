"use client";

/**
 * Topbar User Actions
 *
 * THEME-AWARE: Uses CSS variables and Tailwind dark: variants for consistent theming
 * - Hover states use --popover/10 for semi-transparent backgrounds
 * - Text colors adapt to light/dark mode
 */

import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import UserAvatar from "./user-avatar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

interface TopbarUserActionsProps {
  user: UserInfo;
  className?: string;
}

export function TopbarUserActions({
  user,
  className,
}: TopbarUserActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Theme Switcher */}
      <ThemeSwitcher />

      {/* Admin Gear (only for technicians/admins) */}
      {(user.isTechnician || user.isSuperAdmin) && (
        <div className="flex items-center justify-center w-9 h-9 rounded-md transition-colors hover:bg-[var(--popover)]/10 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <a href="/admin" title="Admin Settings" className="flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15-.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </a>
        </div>
      )}

      {/* User Avatar Dropdown */}
      <UserAvatar user={user} />
    </div>
  );
}
