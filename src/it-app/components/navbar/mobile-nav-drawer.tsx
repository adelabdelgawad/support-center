"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import { Page } from "@/types/pages";
import { useSafeNavigation } from "@/lib/hooks/use-safe-navigation";
import { useNavigationProgress } from "@/lib/context/navigation-progress-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, ChevronDown, LogOut, Menu } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { clearAllNavigationCaches } from "@/lib/cache/navigation-cache";
import { clearCustomViewCache } from "@/lib/cache/custom-views-cache";
import { clearAllMetadataCaches } from "@/lib/cache/metadata-cache";
import {
  getNavigationSection,
  getSortedSections,
  NAVIGATION_SECTIONS,
  type NavigationSection,
} from "@/lib/config/navigation-sections";

interface NavItem {
  id: string;
  title: string;
  path?: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

interface MobileNavDrawerProps {
  pages: Page[];
  user: UserInfo;
  serverPathname?: string;
  serverNavigation?: NavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GroupedNavigation {
  section: NavigationSection;
  label: string;
  items: NavItem[];
  defaultExpanded: boolean;
}

export function MobileNavDrawer({
  pages,
  user,
  serverPathname,
  serverNavigation,
  open,
  onOpenChange,
}: MobileNavDrawerProps) {
  const pathname = usePathname();
  const { navigate } = useSafeNavigation({
    onNavigationStart: () => onOpenChange(false), // Close drawer on navigation
  });
  const { isNavigatingTo } = useNavigationProgress();
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(
    new Set(["primary", "secondary"])
  );
  const [expandedParents, setExpandedParents] = React.useState<Set<string>>(
    new Set()
  );

  const currentPathname = isHydrated ? pathname : serverPathname || "/";

  // Build navigation structure
  const navigation = React.useMemo(() => {
    if (serverNavigation && !isHydrated) {
      return serverNavigation.filter((item) => item.title !== "Profile");
    }
    const activePages = pages.filter((page) => {
      const isActive = (page as any).isActive ?? (page as any).is_active ?? true;
      return isActive && page.title !== "Profile";
    });
    return buildNavigation(activePages);
  }, [pages, serverNavigation, isHydrated]);

  // Group navigation by section
  const groupedNavigation = React.useMemo((): GroupedNavigation[] => {
    const groups: Record<NavigationSection, NavItem[]> = {
      primary: [],
      secondary: [],
      admin: [],
    };

    navigation.forEach((item) => {
      const section = getNavigationSection(item.title);
      groups[section].push(item);
    });

    return getSortedSections()
      .map((section) => ({
        section,
        label: NAVIGATION_SECTIONS[section].label,
        items: groups[section],
        defaultExpanded: NAVIGATION_SECTIONS[section].defaultExpanded,
      }))
      .filter((group) => group.items.length > 0);
  }, [navigation]);

  // Hydration and initial state
  React.useEffect(() => {
    setIsHydrated(true);

    // Find parent of current page and expand it
    const activeParent = navigation.find((item) =>
      item.children.some((child) => child.path === pathname)
    );
    if (activeParent) {
      setExpandedParents((prev) => new Set([...prev, activeParent.id]));
    }
  }, [navigation, pathname]);

  // Reset expanded sections when drawer opens (admin collapsed by default)
  React.useEffect(() => {
    if (open) {
      setExpandedSections(new Set(["primary", "secondary"]));
    }
  }, [open]);

  const handleNavigation = (path: string) => {
    // navigate() will handle closing the drawer via onNavigationStart callback
    navigate(path);
  };

  const handleParentClick = (item: NavItem, e: React.MouseEvent) => {
    if (!item.path && item.children.length > 0) {
      e.preventDefault();
      const firstChild = item.children.find((child) => child.path);
      if (firstChild?.path) {
        handleNavigation(firstChild.path);
      }
    } else if (item.path) {
      handleNavigation(item.path);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const toggleParent = (itemId: string) => {
    setExpandedParents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const isItemActive = (item: NavItem) => {
    return item.path && currentPathname === item.path;
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
      clearAllNavigationCaches();
      clearCustomViewCache();
      clearAllMetadataCaches();
      await fetch("/api/auth/logout", { method: "POST" });
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      navigate("/login");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[300px] p-0 flex flex-col"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation Menu</SheetTitle>
          <SheetDescription>Main navigation menu</SheetDescription>
        </SheetHeader>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b">
          <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-lg font-bold">IT</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold">
              {process.env.NEXT_PUBLIC_APP_TITLE || "IT Service"}
            </span>
            <span className="text-xs text-muted-foreground">Enterprise</span>
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto py-2">
          {groupedNavigation.map((group) => (
            <div key={group.section} className="mb-2">
              <Collapsible
                open={expandedSections.has(group.section)}
                onOpenChange={() => toggleSection(group.section)}
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:bg-accent/50">
                  {group.label}
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform",
                      expandedSections.has(group.section) && "rotate-90"
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <nav className="space-y-1 px-2">
                    {group.items.map((item) => {
                      const isActive = isParentActive(item);
                      const hasChildren = item.children.length > 0;
                      const isExpanded = expandedParents.has(item.id);

                      return (
                        <div key={item.id}>
                          {/* Parent item button - min 44px height for touch */}
                          <button
                            onClick={(e) => {
                              if (hasChildren) {
                                toggleParent(item.id);
                              } else {
                                handleParentClick(item, e);
                              }
                            }}
                            disabled={item.path ? isNavigatingTo(item.path) : false}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md px-3 min-h-[44px] text-sm transition-colors",
                              "hover:bg-accent hover:text-accent-foreground",
                              isActive && !hasChildren && "bg-accent text-accent-foreground font-medium",
                              item.path && isNavigatingTo(item.path) && "opacity-70 cursor-wait"
                            )}
                          >
                            <DynamicIcon name={item.icon} className="h-5 w-5 shrink-0" />
                            <span className="flex-1 text-left">{item.title}</span>
                            {hasChildren && (
                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 shrink-0 transition-transform",
                                  isExpanded && "rotate-90"
                                )}
                              />
                            )}
                          </button>

                          {/* Children */}
                          {hasChildren && isExpanded && (
                            <div className="ml-6 mt-1 space-y-1 border-l border-border pl-3">
                              {item.children.map((child) => (
                                <button
                                  key={child.id}
                                  onClick={() =>
                                    child.path && handleNavigation(child.path)
                                  }
                                  disabled={child.path ? isNavigatingTo(child.path) : false}
                                  className={cn(
                                    "flex w-full items-center rounded-md px-3 min-h-[44px] text-sm transition-colors",
                                    "hover:bg-accent hover:text-accent-foreground",
                                    isItemActive(child) &&
                                      "bg-accent text-accent-foreground font-medium",
                                    child.path && isNavigatingTo(child.path) && "opacity-70 cursor-wait"
                                  )}
                                >
                                  {child.title}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </nav>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </div>

        {/* Footer with User Profile */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage alt={user.fullName} />
              <AvatarFallback>
                {user.fullName
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.fullName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-5 w-5" />
              <span className="sr-only">Log out</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Trigger button for mobile nav
export function MobileNavTrigger({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn("lg:hidden", className)}
    >
      <Menu className="h-5 w-5" />
      <span className="sr-only">Open navigation menu</span>
    </Button>
  );
}

function buildNavigation(pages: Page[]): NavItem[] {
  const navigation: NavItem[] = [];

  const getParentId = (page: Page): string | null => {
    const parentId = (page as any).parentId ?? page.parent_id;
    return parentId != null ? String(parentId) : null;
  };

  const rootPages = pages.filter((page) => !getParentId(page));

  rootPages.forEach((rootPage) => {
    const rootId = String(rootPage.id);
    const children = pages.filter((page) => getParentId(page) === rootId);

    const navItem: NavItem = {
      id: rootPage.id.toString(),
      title: rootPage.title,
      path: rootPage.path
        ? rootPage.path.startsWith("/")
          ? rootPage.path
          : "/" + rootPage.path
        : null,
      icon: rootPage.icon || null,
      children: children.map((child) => ({
        id: child.id.toString(),
        title: child.title,
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
