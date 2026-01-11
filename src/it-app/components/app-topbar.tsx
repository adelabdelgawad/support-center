"use client";

import { Button } from "@/components/ui/button";
import { Avatar as AvatarUI, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bell, Grid, HelpCircle, Phone, Search, User } from "lucide-react";
import UserProfileDropdown from "@/components/profile-user-avatar/UserProfileDropdown";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
export function AppTopbar() {
  return (
    <header className="fixed left-0 right-0 top-0 h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 z-50">
      {/* Left: "+ Add" */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          className="text-gray-600 px-2 py-0 h-8 rounded font-normal text-sm"
        >
          + Add
        </Button>
      </div>

      {/* Center: Fills space */}
      <div className="flex-1"></div>

      {/* Right: Icons and status */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500">
          <Search className="w-5 h-5" />
        </Button>
        {/* Conversations */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            className="h-9 px-3 text-gray-700 font-normal text-sm border bg-gray-100 border-gray-200 rounded"
          >
            Conversations
          </Button>
          <Badge className="bg-gray-300 text-gray-800 px-2 py-0 text-xs rounded-full">
            0
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500">
          <Phone className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500">
          <Bell className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500">
          <Grid className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500">
          <HelpCircle className="w-5 h-5" />
        </Button>
        <ThemeSwitcher />
        <UserProfileDropdown />
      </div>
    </header>
  );
}
