"use client";

import { cn } from "@/lib/utils";
import { UserInfo } from "@/lib/types/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { NavbarTopPanel } from "./navbar-top-panel";
import { Page } from "@/types/pages";

interface NavItem {
  id: string;
  title: string;
  path?: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

interface NavbarProps {
  pages: Page[];
  user: UserInfo;
  serverPathname?: string;
  serverNavigation?: NavItem[];
  serverSelectedParent?: string | null;
}

export function Navbar({
  pages,
  user,
  serverPathname,
  serverNavigation,
  serverSelectedParent,
}: NavbarProps) {
  const pathname = usePathname();
  const [navigation, setNavigation] = useState<NavItem[]>(serverNavigation || []);
  const [notificationCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string | null>(
    serverSelectedParent ?? null
  );

  // Get title from page name directly (English only or default language)
  const getTitle = React.useCallback((page: Page) => page.title, []);

  const currentPathname = pathname || serverPathname || "/";

  // Build navigation structure
  const buildNavigationMemo = React.useMemo(() => {
    if (serverNavigation) {
      const filteredServerNav = serverNavigation.filter((item) => item.title !== "Profile");
      return filteredServerNav;
    }
    // Handle both camelCase (isActive) and snake_case (is_active) from API
    const activePages = pages.filter((page) => {
      const isActive = page.isActive ?? page.is_active ?? true;
      return isActive && page.title !== "Profile";
    });
    return buildNavigation(activePages, getTitle);
  }, [pages, getTitle, serverNavigation]);

  // Suppress eslint warnings for these effects - they need to update state based on props/pathname
  useEffect(() => {
    if (!serverNavigation) {
      const activePages = pages.filter((page) => {
        const isActive = page.isActive ?? page.is_active ?? true;
        return isActive && page.title !== "Profile";
      });
      const nav = buildNavigation(activePages, getTitle);
      // Using React.startTransition to avoid the warning
      React.startTransition(() => {
        setNavigation(nav);
      });
    } else {
      const filteredServerNav = serverNavigation.filter((item) => item.title !== "Profile");
      React.startTransition(() => {
        setNavigation(filteredServerNav);
      });

      if (serverSelectedParent === undefined) {
        const parent = filteredServerNav.find(
          (item) =>
            item.children.length > 0 &&
            item.children.some((child) => child.path === currentPathname)
        );
        React.startTransition(() => {
          if (parent) {
            setSelectedParent(parent.id);
          } else {
            const mainPath = "/" + (currentPathname ?? "").split("/")[1];
            const parentByPath = filteredServerNav.find(
              (item) => item.path === mainPath && item.children.length > 0
            );
            if (parentByPath) {
              setSelectedParent(parentByPath.id);
            } else {
              setSelectedParent(null);
            }
          }
        });
      }
    }
  }, [
    pages,
    pathname,
    getTitle,
    serverNavigation,
    serverSelectedParent,
    currentPathname,
  ]);

  useEffect(() => {
    const parent = navigation.find(
      (item) =>
        item.children.length > 0 &&
        item.children.some((child) => child.path === pathname)
    );
    React.startTransition(() => {
      if (parent) {
        setSelectedParent(parent.id);
      } else {
        const mainPath = "/" + (pathname ?? "").split("/")[1];
        const parentByPath = navigation.find(
          (item) => item.path === mainPath && item.children.length > 0
        );
        if (parentByPath) {
          setSelectedParent(parentByPath.id);
        } else {
          setSelectedParent(null);
        }
      }
    });
  }, [pathname, navigation]);

  const currentNavigation = navigation.length > 0 ? navigation : buildNavigationMemo;
  const mainNavItems = currentNavigation.filter(
    (item) => item.isParent || item.children.length === 0
  );

  const getSubNavItems = () => {
    if (!selectedParent) {
      return [];
    }
    const parent = currentNavigation.find((item) => item.id === selectedParent);
    return parent?.children || [];
  };

  const subNavItems = getSubNavItems();

  const handleParentClick = (item: NavItem, e: React.MouseEvent) => {
    if (item.children.length > 0 && !item.path) {
      e.preventDefault();
      setSelectedParent(item.id === selectedParent ? null : item.id);
    }
  };

  return (
    <nav className="bg-white">
      <NavbarTopPanel
        user={user}
        isRTL={false}
        notificationCount={notificationCount}
      />

      <div className="bg-[#2c3e50] h-10">
        <div className="flex h-full items-center px-2 flex-row">
          {mainNavItems.map((item) => {
            const isActive =
              item.children.length > 0
                ? item.id === selectedParent
                : item.path && currentPathname.startsWith(item.path);
            const hasChildren = item.children.length > 0;

            return !item.path ? (
              <button
                key={item.id}
                onClick={(e) => handleParentClick(item, e)}
                className={cn(
                  "px-4 h-full flex items-center text-sm font-normal transition-colors ",
                  isActive
                    ? "bg-[#27ae60] text-white"
                    : "text-gray-300 hover:bg-gray-700/50"
                )}
              >
                <span className="whitespace-nowrap">{item.title}</span>
              </button>
            ) : (
              <Link
                key={item.id}
                href={item.path}
                onClick={(e) => {
                  if (hasChildren && !item.path) {
                    handleParentClick(item, e);
                  }
                }}
                className={cn(
                  "px-4 h-full flex items-center text-sm font-normal transition-colors",
                  isActive
                    ? "bg-[#27ae60] text-white"
                    : "text-gray-300 hover:bg-gray-700/50"
                )}
              >
                <span className="whitespace-nowrap">{item.title}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {subNavItems.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className="flex h-10 items-center px-4 gap-1 flex-row">
            {subNavItems
              .filter((item) => item.path)
              .map((item) => {
                const isActive = currentPathname === item.path;
                return item.path ? (
                  <Link
                    key={item.id}
                    href={item.path}
                    className={cn(
                      "px-4 py-2 text-sm font-normal transition-all relative",
                      isActive
                        ? "text-gray-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#27ae60]"
                        : "text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-transparent"
                    )}
                  >
                    <span className="whitespace-nowrap">{item.title}</span>
                  </Link>
                ) : null;
              })}
          </div>
        </div>
      )}

      {mobileMenuOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 z-50 bg-white border-b shadow-lg">
          <div className="px-4 py-2 space-y-1 max-h-96 overflow-y-auto">
            {currentNavigation.map((item) => {
              const isActive = item.path && currentPathname.startsWith(item.path);

              return (
                <div key={item.id}>
                  {!item.path ? (
                    <button
                      onClick={(e) => {
                        handleParentClick(item, e);
                        setMobileMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left",
                        item.id === selectedParent
                          ? "bg-[#27ae60] text-white"
                          : "hover:bg-gray-100",
                        "flex-row text-left"
                      )}
                    >
                      <span className="whitespace-nowrap">{item.title}</span>
                    </button>
                  ) : (
                    <Link
                      href={item.path}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setSelectedParent(null);
                      }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
                        isActive
                          ? "bg-gray-200 text-gray-900"
                          : "hover:bg-gray-100",
                        "flex-row text-left"
                      )}
                    >
                      <span className="whitespace-nowrap">{item.title}</span>
                    </Link>
                  )}

                  {item.children.length > 0 && item.id === selectedParent && (
                    <div className="mt-1 space-y-1 pl-8">
                      {item.children
                        .filter((child) => child.path)
                        .map((child) => {
                          const isChildActive = currentPathname === child.path;
                          return child.path ? (
                            <Link
                              key={child.id}
                              href={child.path}
                              onClick={() => setMobileMenuOpen(false)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 text-sm",
                                isChildActive
                                  ? "bg-[#27ae60] text-white"
                                  : "bg-gray-100 hover:bg-transparent",
                                "flex-row"
                              )}
                            >
                              <span>{child.title}</span>
                            </Link>
                          ) : null;
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

function buildNavigation(
  pages: Page[],
  getTitle: (page: Page) => string
): NavItem[] {
  const navigation: NavItem[] = [];

  // Handle both snake_case (parent_id) and camelCase (parentId) from API
  const rootPages = pages.filter((page) => {
    const parentId = (page as any).parentId ?? page.parent_id;
    return !parentId;
  });

  rootPages.forEach((rootPage) => {
    const children = pages.filter((page) => {
      const parentId = (page as any).parentId ?? page.parent_id;
      return parentId === rootPage.id;
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

