"use server";

import type { PageResponse } from "@/types/pages";

/**
 * Fetches all available pages for role assignment
 * Simplified version for support-center (Users & Roles only)
 */
export async function getPages() {
  // For support-center, we have a static set of pages
  // No need to fetch from backend API
  const pages: PageResponse[] = [
    {
      id: 1,
      title: "Users",
      enTitle: "Users",
      arTitle: "المستخدمين",
      path: "/support-center/users",
      icon: "Users",
      _isActive: true,
      isActive: true,
      parentId: null,
    },
    {
      id: 2,
      title: "Roles",
      enTitle: "Roles",
      arTitle: "الأدوار",
      path: "/support-center/roles",
      icon: "Shield",
      _isActive: true,
      isActive: true,
      parentId: null,
    },
  ];

  return {
    pages,
    total: pages.length,
  };
}
