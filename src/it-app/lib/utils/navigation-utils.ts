/**
 * Navigation Utilities
 *
 * Server-side navigation builder for main pages.
 * Based on network_manager's buildNavigationWithState pattern.
 *
 * Key pattern:
 * - Server computes all navigation state before rendering
 * - Client receives exact state as props (no mismatches)
 * - Clear hydration boundary with isHydrated flag
 */

import type { Page } from "@/types/pages";

export interface NavItem {
  id: string;
  title: string;
  path: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

/**
 * Build navigation with all state computed server-side
 * Based on network_manager pattern
 *
 * @param pages - User's accessible pages
 * @param currentPath - Current pathname for active state calculation
 * @returns Navigation structure with pre-computed state
 */
export function buildNavigationWithState(
  pages: Page[],
  currentPath: string
): {
  navigation: NavItem[];
  selectedParent: string | null;
} {
  // Filter active pages (exclude Profile from main nav)
  const filteredPages = pages.filter(
    (page) => (page.isActive || page.is_active) && page.title !== "Profile"
  );
  const navigation = buildNavigation(filteredPages);

  // Calculate selected parent for navbar
  const selectedParent = calculateSelectedParent(navigation, currentPath);

  return { navigation, selectedParent };
}

/**
 * Build navigation structure from pages
 */
function buildNavigation(pages: Page[]): NavItem[] {
  const navigation: NavItem[] = [];

  // Filter only root level pages (pages without parentId)
  const rootPages = pages.filter((page) => !page.parentId && !page.parent_id);

  // Build navigation for each root page
  rootPages.forEach((rootPage) => {
    // Find all children for this root page
    const children = pages.filter(
      (page) => page.parentId === rootPage.id || page.parent_id === rootPage.id
    );

    // Create the navigation item
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

/**
 * Calculate selected parent for navbar
 * Based on network_manager pattern
 */
function calculateSelectedParent(
  navigation: NavItem[],
  pathname: string
): string | null {
  if (!pathname) {
    return null;
  }

  // First check if current path matches any child page
  const parentWithMatchingChild = navigation.find(
    (item) =>
      item.children.length > 0 &&
      item.children.some((child) => child.path === pathname)
  );

  if (parentWithMatchingChild) {
    return parentWithMatchingChild.id;
  }

  // Check if current path matches parent path
  const mainPath = "/" + pathname.split("/")[1];
  const parentByPath = navigation.find(
    (item) => item.path === mainPath && item.children.length > 0
  );

  if (parentByPath) {
    return parentByPath.id;
  }

  return null;
}
