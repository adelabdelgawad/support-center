// navbar-top-panel.tsx
"use client";

import React from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import UserAvatar from "./user-avatar";


const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || "IT Service Catalog";

interface NavbarTopPanelProps {
  user: UserInfo;
  isRTL?: boolean;
  notificationCount?: number;
  onMobileMenuToggle?: () => void;
  showMobileMenu?: boolean;
}

export function NavbarTopPanel({ 
  user, 
  isRTL = false,
  notificationCount = 0,
  onMobileMenuToggle,
  showMobileMenu = false
}: NavbarTopPanelProps) {
  return (
    <div className="flex h-14 items-center justify-between px-4 bg-gray-100 border-b border-gray-200">
      {/* Left side - Logo and App Name */}
      <div className={cn(
        "flex items-center gap-3",
        isRTL ? "flex-row-reverse" : "flex-row"
      )}>
        {/* Mobile menu button */}
        {onMobileMenuToggle && (
          <MobileMenuButton 
            onClick={onMobileMenuToggle}
            isOpen={showMobileMenu}
          />
        )}

        {/* Logo and App Name */}
        <LogoSection appTitle={APP_TITLE} isRTL={isRTL} />
      </div>

      {/* Right side - User controls */}
      <div className={cn(
        "flex items-center gap-3",
        isRTL ? "flex-row-reverse" : "flex-row"
      )}>
        {/* <ShareButton />
        <ExpandButton /> */}
        <HelpButton />
        <SettingsButton />
        <NotificationButton count={notificationCount} isRTL={isRTL} />
        {/* <LanguageSwitcher /> */}
        <UserAvatar user={user} />
      </div>
    </div>
  );
}

// Sub-components for better organization

interface MobileMenuButtonProps {
  onClick: () => void;
  isOpen?: boolean;
}

function MobileMenuButton({ onClick, isOpen }: MobileMenuButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      onClick={onClick}
      aria-label={isOpen ? "Close menu" : "Open menu"}
    >
      <Icons.Menu className="h-5 w-5" />
    </Button>
  );
}

interface LogoSectionProps {
  appTitle: string;
  isRTL?: boolean;
}

function LogoSection({ appTitle, isRTL }: LogoSectionProps) {
  return (
    <div className={cn(
      "flex items-center gap-2",
      isRTL ? "flex-row-reverse" : "flex-row"
    )}>
      <div className="flex h-8 w-8 items-center justify-center">
        <Icons.Grid3x3 className="h-6 w-6 text-gray-600" />
      </div>
      <span className="font-medium text-gray-800 text-base">{appTitle}</span>
    </div>
  );
}


function HelpButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-gray-600 hover:bg-gray-200"
      aria-label="Help"
    >
      <Icons.HelpCircle className="h-5 w-5" />
    </Button>
  );
}

function SettingsButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-gray-600 hover:bg-gray-200"
      asChild
    >
      <Link href="/settings" aria-label="Settings">
        <Icons.Settings className="h-5 w-5" />
      </Link>
    </Button>
  );
}

interface NotificationButtonProps {
  count?: number;
  isRTL?: boolean;
}

function NotificationButton({ count = 0, isRTL }: NotificationButtonProps) {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="text-gray-600 hover:bg-gray-200"
        aria-label={`Notifications${count > 0 ? ` (${count})` : ''}`}
      >
        <Icons.Bell className="h-5 w-5" />
      </Button>
      {count > 0 && (
        <span className={cn(
          "absolute -top-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center",
          isRTL ? "-left-1" : "-right-1"
        )}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </div>
  );
}