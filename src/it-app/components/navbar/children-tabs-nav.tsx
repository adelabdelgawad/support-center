"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Page } from "@/types/pages";

interface NavItem {
  id: string;
  title: string;
  path?: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

interface ChildrenTabsNavProps {
  pages: Page[];
  serverPathname?: string;
  serverNavigation?: NavItem[];
}

export function ChildrenTabsNav({
  pages,
  serverPathname,
  serverNavigation,
}: ChildrenTabsNavProps) {
  const pathname = usePathname();
  const [navigation, setNavigation] = React.useState<NavItem[]>(
    serverNavigation || []
  );
  const [isHydrated, setIsHydrated] = React.useState(false);

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

  React.useEffect(() => {
    setIsHydrated(true);
    if (!serverNavigation) {
      const activePages = pages.filter((page) => {
        const isActive = page.isActive ?? page.is_active ?? true;
        return isActive && page.title !== "Profile";
      });
      const nav = buildNavigation(activePages, getTitle);
      setNavigation(nav);
    } else {
      setNavigation(serverNavigation.filter((item) => item.title !== "Profile"));
    }
  }, [pages, getTitle, serverNavigation]);

  const currentNavigation =
    navigation.length > 0 ? navigation : buildNavigationMemo;

  // Find the active parent and its children
  const getActiveParentAndChildren = () => {
    for (const item of currentNavigation) {
      // Check if current path matches this parent's path
      if (item.path && currentPathname.startsWith(item.path)) {
        return { parent: item, children: item.children };
      }
      // Check if current path matches any child
      const matchingChild = item.children.find(
        (child) => child.path && currentPathname === child.path
      );
      if (matchingChild) {
        return { parent: item, children: item.children };
      }
    }
    return { parent: null, children: [] };
  };

  const { parent, children } = getActiveParentAndChildren();

  // Only show tab navigation if there are children
  if (!parent || children.length === 0) {
    return null;
  }

  // Find the currently active child
  const activeChild = children.find(
    (child) => child.path && currentPathname === child.path
  );

  // If no active child found, try to find by startsWith for nested routes
  const currentChild = activeChild || children.find(
    (child) => child.path && currentPathname.startsWith(child.path!)
  );

  if (!currentChild) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-1 py-1">
      {/* Parent Title */}
      <h1 className="text-lg font-semibold text-foreground">
        {parent.title}
      </h1>
      <span className="text-muted-foreground">/</span>

      {/* Current Page Title */}
      <span className="text-lg font-medium text-foreground">
        {currentChild.title}
      </span>
    </div>
  );
}

function buildNavigation(
  pages: Page[],
  getTitle: (page: Page) => string
): NavItem[] {
  const navigation: NavItem[] = [];

  // Get root pages (pages without parent)
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
