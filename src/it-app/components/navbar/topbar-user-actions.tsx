"use client";

import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import UserAvatar from "./user-avatar";
import { ThemeSwitcher } from "./theme-switcher";

interface TopbarUserActionsProps {
  user: UserInfo;
  notificationCount?: number;
  className?: string;
}

export function TopbarUserActions({
  user,
  notificationCount = 0,
  className,
}: TopbarUserActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Notifications */}
      <button
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-md transition-colors",
          "hover:bg-white/10 text-gray-300 hover:text-white"
        )}
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {notificationCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
          </span>
        )}
      </button>

      {/* Theme Switcher */}
      <ThemeSwitcher />

      {/* Admin Gear (only for technicians/admins) */}
      {(user.isTechnician || user.is_technician || user.isSuperAdmin || user.is_super_admin) && (
        <div className="flex items-center justify-center w-9 h-9 rounded-md transition-colors hover:bg-white/10 text-gray-300 hover:text-white">
          <a href="/admin" title="Admin Settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
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
