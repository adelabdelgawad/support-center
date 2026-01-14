"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import { Page } from "@/types/pages";
import { SafeLink } from "@/components/ui/safe-link";
import { useSafeNavigation } from "@/lib/hooks/use-safe-navigation";
import { useNavigationProgress } from "@/lib/context/navigation-progress-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Settings as SettingsIcon,
  MoreHorizontal,
} from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";

// LocalStorage key for persisting expanded nav items
const NAV_EXPANDED_KEY = 'nav-expanded-items';

// Helper to load expanded items from localStorage
function loadExpandedItems(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(NAV_EXPANDED_KEY);
    if (stored) {
      const items = JSON.parse(stored);
      if (Array.isArray(items)) {
        return new Set(items);
      }
    }
  } catch (error) {
    console.warn('[NavExpanded] Failed to load:', error);
  }
  return new Set();
}

// Helper to save expanded items to localStorage
function saveExpandedItems(items: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NAV_EXPANDED_KEY, JSON.stringify([...items]));
  } catch (error) {
    console.warn('[NavExpanded] Failed to save:', error);
  }
}

interface NavItem {
  id: string;
  title: string;
  path?: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

interface VerticalSidebarNavProps {
  pages: Page[];
  user: UserInfo;
  serverPathname?: string;
  serverNavigation?: NavItem[];
}

export function VerticalSidebarNav({
  pages,
  user,
  serverPathname,
  serverNavigation,
}: VerticalSidebarNavProps) {
  const pathname = usePathname();
  const { navigate } = useSafeNavigation();
  const { isNavigatingTo } = useNavigationProgress();
  const [navigation, setNavigation] = React.useState<NavItem[]>(
    serverNavigation || []
  );
  const [isHydrated, setIsHydrated] = React.useState(false);
  // Initialize with empty set to avoid hydration mismatch
  const [openItems, setOpenItems] = React.useState<Set<string>>(new Set());
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = React.useState(false);

  const currentPathname = isHydrated ? pathname : serverPathname || "/";

  // Get title from page
  const getTitle = React.useCallback((page: Page) => page.title, []);

  // Build navigation structure
  const buildNavigationMemo = React.useMemo(() => {
    if (serverNavigation && !isHydrated) {
      return serverNavigation.filter((item) => item.title !== "Profile");
    }
    const activePages = pages.filter((page) => {
      const isActive = page.isActive ?? page.is_active ?? true;
      return isActive && page.title !== "Profile";
    });
    return buildNavigation(activePages, getTitle);
  }, [pages, getTitle, serverNavigation, isHydrated]);

  // Load expanded items from localStorage on mount
  React.useEffect(() => {
    setIsHydrated(true);

    // Load persisted expanded items
    const storedItems = loadExpandedItems();

    // Build navigation
    let currentNav: NavItem[];
    if (!serverNavigation) {
      const activePages = pages.filter((page) => {
        const isActive = page.isActive ?? page.is_active ?? true;
        return isActive && page.title !== "Profile";
      });
      currentNav = buildNavigation(activePages, getTitle);
      setNavigation(currentNav);
    } else {
      currentNav = serverNavigation.filter((item) => item.title !== "Profile");
      setNavigation(currentNav);
    }

    // Find parent of current page and ensure it's expanded
    const activeParent = currentNav.find((item) =>
      item.children.some((child) => child.path === currentPathname)
    );

    // Merge persisted items with current page's parent
    if (activeParent) {
      storedItems.add(activeParent.id);
    }

    setOpenItems(storedItems);
    setHasLoadedFromStorage(true);
  }, [pages, getTitle, serverNavigation, currentPathname]);

  const currentNavigation =
    navigation.length > 0 ? navigation : buildNavigationMemo;

  // Handle parent click with auto-redirect to first child
  const handleNavItemClick = (
    item: NavItem,
    e: React.MouseEvent<HTMLAnchorElement>
  ): boolean | void => {
    // If parent has no path but has children, redirect to first child
    if (!item.path && item.children.length > 0) {
      e.preventDefault();
      const firstChild = item.children.find((child) => child.path);
      if (firstChild?.path) {
        navigate(firstChild.path);
      }
      return false; // Prevent SafeLink default navigation
    }
  };

  // Toggle parent item open/closed and persist to localStorage
  const toggleItem = (itemId: string) => {
    setOpenItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      // Persist to localStorage
      saveExpandedItems(newSet);
      return newSet;
    });
  };

  // Check if current path belongs to a parent's children
  const isItemActive = (item: NavItem) => {
    if (item.path && currentPathname === item.path) {
      return true;
    }
    return false;
  };

  const isParentActive = (item: NavItem) => {
    if (item.path && currentPathname.startsWith(item.path)) {
      return true;
    }
    return item.children.some(
      (child) => child.path && currentPathname === child.path
    );
  };

  const handleLogout = async () => {
    try {
      // Clear all caches before logout
      // Clear expanded nav items
      if (typeof window !== 'undefined') {
        localStorage.removeItem(NAV_EXPANDED_KEY);
      }
      await fetch("/api/auth/logout", { method: "POST" });
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      // Still redirect to login even if API call fails
      navigate("/login");
    }
  };

  return (
    <Sidebar collapsible="icon">
      {/* Header with App Switcher */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <span className="text-base font-bold">IT</span>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {process.env.NEXT_PUBLIC_APP_TITLE || "IT Service"}
                    </span>
                    <span className="truncate text-xs">Enterprise</span>
                  </div>
                  <ChevronDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuItem className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <span className="text-xs font-bold">IT</span>
                  </div>
                  {process.env.NEXT_PUBLIC_APP_TITLE || "IT Service"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Navigation Menu */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {currentNavigation.map((item) => {
                const isActive = isParentActive(item);
                const isOpen = openItems.has(item.id);
                const hasChildren = item.children.length > 0;

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive && !hasChildren}
                      tooltip={item.title}
                      onClick={() => hasChildren && toggleItem(item.id)}
                    >
                      {item.path ? (
                        <SafeLink
                          href={item.path}
                          onClick={(e: React.MouseEvent<HTMLAnchorElement>) => handleNavItemClick(item, e)}
                          className={cn(
                            isNavigatingTo(item.path) && "opacity-70 cursor-wait"
                          )}
                        >
                          <DynamicIcon name={item.icon} />
                          <span>{item.title}</span>
                          {hasChildren && (
                            <ChevronRight
                              className={cn(
                                "ml-auto transition-transform",
                                isOpen && "rotate-90"
                              )}
                            />
                          )}
                        </SafeLink>
                      ) : (
                        <button className="w-full">
                          <DynamicIcon name={item.icon} />
                          <span>{item.title}</span>
                          {hasChildren && (
                            <ChevronRight
                              className={cn(
                                "ml-auto transition-transform",
                                isOpen && "rotate-90"
                              )}
                            />
                          )}
                        </button>
                      )}
                    </SidebarMenuButton>

                    {hasChildren && isOpen && (
                      <SidebarMenuSub>
                        {item.children.map((child) => (
                          <SidebarMenuSubItem key={child.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isItemActive(child)}
                            >
                              <SafeLink
                                href={child.path || "#"}
                                className={cn(
                                  child.path && isNavigatingTo(child.path) && "opacity-70 cursor-wait"
                                )}
                              >
                                <span>{child.title}</span>
                              </SafeLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with User Profile */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage alt={user.fullName} />
                    <AvatarFallback className="rounded-lg">
                      {user.fullName
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user.fullName}
                    </span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                  <MoreHorizontal className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <SafeLink href="/profile" className="cursor-pointer">
                    <UserIcon className="mr-2 h-4 w-4" />
                    Profile
                  </SafeLink>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <SafeLink href="/settings" className="cursor-pointer">
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    Settings
                  </SafeLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-600 focus:text-red-600 cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function buildNavigation(
  pages: Page[],
  getTitle: (page: Page) => string
): NavItem[] {
  const navigation: NavItem[] = [];

  // Helper to get parent ID as string (handles both camelCase and snake_case)
  const getParentId = (page: Page): string | null => {
    const parentId = (page as any).parentId ?? page.parent_id;
    return parentId != null ? String(parentId) : null;
  };

  // Get root pages (pages without parent)
  const rootPages = pages.filter((page) => {
    const parentId = getParentId(page);
    return !parentId;
  });

  rootPages.forEach((rootPage) => {
    const rootId = String(rootPage.id);
    const children = pages.filter((page) => {
      const parentId = getParentId(page);
      return parentId === rootId;
    });

    const navItem: NavItem = {
      id: rootPage.id.toString(),
      title: getTitle(rootPage),
      path: rootPage.path
        ? rootPage.path.startsWith("/")
          ? rootPage.path
          : "/" + rootPage.path
        : null,
      icon: rootPage.icon || null,
      children: children.map((child) => ({
        id: child.id.toString(),
        title: getTitle(child),
        path: child.path
          ? child.path.startsWith("/")
            ? child.path
            : "/" + child.path
          : null,
        icon: child.icon || null,
        children: [],
        isParent: false,
      })),
      isParent: children.length > 0,
    };
    navigation.push(navItem);
  });

  return navigation;
}
