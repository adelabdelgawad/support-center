/**
 * Admin Navigation Utilities
 *
 * Server-side navigation builder for admin pages.
 * Based on network_manager's buildNavigationWithState pattern.
 *
 * Key pattern:
 * - Server computes all navigation state before rendering
 * - Client receives exact state as props (no mismatches)
 * - Clear hydration boundary with isHydrated flag
 */

import { ADMIN_SECTIONS, type AdminLink } from "@/lib/config/admin-sections";

// Re-export for convenience
export type { AdminLink } from "@/lib/config/admin-sections";

// Admin section format expected by the component (with computed properties)
export interface AdminSection {
  id: string;
  title: string;
  href: string | null;
  icon?: string | null;
  links: AdminLink[];
  isParent: boolean;
}

/**
 * Build admin navigation structure server-side
 * Based on network_manager's buildNavigationWithState pattern
 *
 * @param _pages - User's accessible pages (unused, kept for API compatibility)
 * @param currentPath - Current pathname for active state calculation
 * @returns Navigation structure with pre-computed state
 */
export function buildAdminNavigationWithState(
  _pages: unknown[],
  currentPath: string
): {
  navigation: AdminSection[];
  expandedSections: Set<string>;
  activeLink: string | null;
} {
  // Convert all ADMIN_SECTIONS to AdminSection format (adding href and isParent)
  // Note: Admin navigation is shown to all technicians/admins
  // Individual admin pages have their own access control
  const navigation: AdminSection[] = ADMIN_SECTIONS.map((section) => ({
    ...section,
    href: null, // Sections are not directly clickable, only links are
    isParent: section.links.length > 0,
  }));

  // Calculate which section should be expanded based on current path
  const expandedSections = new Set<string>();
  let activeLink: string | null = null;

  for (const section of navigation) {
    const hasActiveLink = section.links.some(
      (link) => link.href === currentPath
    );
    if (hasActiveLink) {
      expandedSections.add(section.id);
      activeLink = currentPath;
    }
  }

  return {
    navigation,
    expandedSections,
    activeLink,
  };
}

/**
 * Find section by link href
 * Used for client-side updates after hydration
 */
export function findSectionByHref(
  navigation: AdminSection[],
  href: string
): AdminSection | null {
  for (const section of navigation) {
    if (section.links.some((link) => link.href === href)) {
      return section;
    }
  }
  return null;
}

/**
 * Calculate which sections should be expanded for a given path
 * Used for client-side updates after hydration
 */
export function calculateExpandedSections(
  navigation: AdminSection[],
  currentPath: string
): Set<string> {
  const expandedSections = new Set<string>();

  for (const section of navigation) {
    const hasActiveLink = section.links.some(
      (link) => link.href === currentPath
    );
    if (hasActiveLink) {
      expandedSections.add(section.id);
    }
  }

  return expandedSections;
}
