"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Grid3x3,
  Search,
  Settings,
  LogOut,
  User,
  HelpCircle,
  Bell,
} from "lucide-react";

interface AppTile {
  id: string;
  name: string;
  icon: React.ReactNode;
  href: string;
  color: string;
}

interface OfficeTopBarProps {
  appTitle: string;
  user: {
    fullName?: string;
    email?: string;
    avatarUrl?: string;
  };
  onLogout?: () => void;
  className?: string;
}

// Default Microsoft 365 apps for the waffle menu
const defaultApps: AppTile[] = [
  {
    id: "support-center",
    name: "Support Center",
    icon: "🎫",
    href: "/support-center",
    color: "#0078d4",
  },
  {
    id: "settings",
    name: "Settings",
    icon: "⚙️",
    href: "/setting",
    color: "#107c10",
  },
];

export function OfficeTopBar({
  appTitle,
  user,
  onLogout,
  className,
}: OfficeTopBarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      router.push("/login");
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Implement search functionality
  };

  const getUserInitials = () => {
    if (!user.fullName) return "U";
    const names = user.fullName.split(" ");
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return user.fullName[0].toUpperCase();
  };

  return (
    <header
      className={cn(
        "office-topbar sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background px-4 shadow-fluent-2",
        className
      )}
    >
      {/* Left Section: App Launcher + App Title */}
      <div className="flex items-center gap-3">
        {/* App Launcher (Waffle Menu) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8"
              aria-label="App Launcher"
            >
              <Grid3x3 className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-80 p-4"
            align="start"
            sideOffset={8}
          >
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Applications
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {defaultApps.map((app) => (
                  <Link
                    key={app.id}
                    href={app.href}
                    className="app-tile"
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-fluent text-2xl"
                      style={{ backgroundColor: `${app.color}15` }}
                    >
                      {app.icon}
                    </div>
                    <span className="text-xs font-medium text-center line-clamp-2">
                      {app.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* App Title */}
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold hover:opacity-80 duration-faster"
        >
          {appTitle}
        </Link>
      </div>

      {/* Center Section: Search Bar */}
      <form
        onSubmit={handleSearch}
        className="flex-1 max-w-xl mx-4"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 h-8 bg-muted/30 border-transparent focus:bg-background focus:border-border"
          />
        </div>
      </form>

      {/* Right Section: Actions + User Profile */}
      <div className="flex items-center gap-2">
        {/* Help Button */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8"
          aria-label="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8 relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
        </Button>

        {/* Settings */}
        <Link href="/setting">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </Link>

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 rounded-full p-0"
              aria-label="User menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                <AvatarFallback className="text-xs font-semibold">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center gap-3 p-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                <AvatarFallback className="text-sm font-semibold">
                  {getUserInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-semibold truncate">
                  {user.fullName || "User"}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {user.email || ""}
                </span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              variant="destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
