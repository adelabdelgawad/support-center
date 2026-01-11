"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Page } from "@/types/pages";

interface NavItem {
  id: string;
  title: string;
  path?: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

interface PageRedirectHandlerProps {
  pages: Page[];
}

/**
 * Handles automatic redirection for parent pages without paths
 * Redirects to the first child page when accessing a parent-only route
 */
export function PageRedirectHandler({ pages }: PageRedirectHandlerProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Build navigation to find parent pages
    const navigation = buildNavigation(pages);

    // Check if current path matches a parent without a path
    for (const item of navigation) {
      // If this parent has no path but has children
      if (!item.path && item.children.length > 0) {
        // Find the first child with a path
        const firstChild = item.children.find((child) => child.path);

        if (firstChild?.path) {
          // Check if we're on a path that should redirect
          // This could be a custom matching logic based on your needs
          // For now, we'll redirect if pathname matches any pattern that indicates
          // we're trying to access the parent

          // You can customize this logic based on your routing structure
          const shouldRedirect = pathname === item.path ||
                                pathname === `/${item.id}` ||
                                pathname.endsWith(`/${item.title.toLowerCase().replace(/\s+/g, '-')}`);

          if (shouldRedirect) {
            router.replace(firstChild.path);
          }
        }
      }
    }
  }, [pathname, pages, router]);

  return null; // This component doesn't render anything
}

function buildNavigation(pages: Page[]): NavItem[] {
  const navigation: NavItem[] = [];
  const getTitle = (page: Page) => page.title;

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
