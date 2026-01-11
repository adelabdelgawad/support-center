/**
 * Navigation Section Configuration
 *
 * Defines how navigation items are grouped for mobile display.
 * Desktop sidebar shows all items under "Platform" label.
 * Mobile drawer groups items into sections for better UX.
 */

export type NavigationSection = "primary" | "secondary" | "admin";

/**
 * Section definitions with display order and default expanded state
 */
export const NAVIGATION_SECTIONS: Record<
  NavigationSection,
  {
    label: string;
    order: number;
    defaultExpanded: boolean;
  }
> = {
  primary: {
    label: "Main",
    order: 1,
    defaultExpanded: true,
  },
  secondary: {
    label: "Tools",
    order: 2,
    defaultExpanded: true,
  },
  admin: {
    label: "Administration",
    order: 3,
    defaultExpanded: false, // Collapsed by default on mobile
  },
};

/**
 * Maps navigation item titles to their sections.
 * Items not in this map default to "secondary" section.
 *
 * NOTE: These match the page titles from the backend.
 * If backend titles change, update this mapping.
 */
export const NAVIGATION_SECTION_MAP: Record<string, NavigationSection> = {
  // Primary section - most frequently used
  "Requests": "primary",
  "Active Sessions": "primary",

  // Secondary section - tools and reports
  "Deployments": "secondary",
  "Reports": "secondary",

  // Admin section - configuration and management
  "Roles": "admin",
  "Users": "admin",
  "Regions": "admin",
  "Business Units": "admin",
  "Request Status": "admin",
  "System Events": "admin",
  "System Messages": "admin",
  "Request Types": "admin",
  "Client Versions": "admin",
  "Categories": "admin",
  "Priorities": "admin",
  "Settings": "admin",
};

/**
 * Get the section for a navigation item by its title.
 * Falls back to "secondary" if not explicitly mapped.
 */
export function getNavigationSection(title: string): NavigationSection {
  return NAVIGATION_SECTION_MAP[title] || "secondary";
}

/**
 * Get all sections in display order
 */
export function getSortedSections(): NavigationSection[] {
  return (Object.keys(NAVIGATION_SECTIONS) as NavigationSection[]).sort(
    (a, b) => NAVIGATION_SECTIONS[a].order - NAVIGATION_SECTIONS[b].order
  );
}
