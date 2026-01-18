/**
 * Admin Hub Sections Configuration
 *
 * Defines the categorized sections for the admin hub page.
 * Each section contains a title, icon, description, and links to admin pages.
 */

export interface AdminLink {
  label: string;
  href: string;
}

export interface AdminSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  links: AdminLink[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: "users-permissions",
    title: "Users & Permissions",
    icon: "Users",
    description: "Manage users, roles, and permissions",
    links: [
      { label: "Users", href: "/admin/setting/users" },
      { label: "Roles", href: "/admin/setting/roles" },
    ],
  },
  {
    id: "service-configuration",
    title: "Service Configuration",
    icon: "Settings",
    description: "Configure service desk settings",
    links: [
      { label: "Categories", href: "/admin/setting/categories" },
      { label: "Request Types", href: "/admin/setting/request-types" },
      { label: "Request Statuses", href: "/admin/setting/request-statuses" },
      { label: "SLA Configs", href: "/admin/setting/sla-configs" },
    ],
  },
  {
    id: "business-structure",
    title: "Business Structure",
    icon: "Building",
    description: "Organizational units and regions",
    links: [
      { label: "Business Units", href: "/admin/setting/business-units" },
      { label: "Business Unit Regions", href: "/admin/setting/business-unit-regions" },
    ],
  },
  {
    id: "system-settings",
    title: "System Settings",
    icon: "Settings2",
    description: "System messages and events",
    links: [
      { label: "System Messages", href: "/admin/setting/system-messages" },
      { label: "System Events", href: "/admin/setting/system-events" },
      { label: "Client Versions", href: "/admin/setting/client-versions" },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    icon: "Activity",
    description: "System operations and monitoring",
    links: [
      { label: "Active Sessions", href: "/admin/management/active-sessions" },
      { label: "Deployments", href: "/admin/management/deployments" },
      { label: "Scheduler", href: "/admin/management/scheduler" },
    ],
  },
];

// Helper function to find section by link href
export function findSectionByHref(href: string): AdminSection | null {
  for (const section of ADMIN_SECTIONS) {
    if (section.links.some(link => link.href === href)) {
      return section;
    }
  }
  return null;
}

// Helper function to get all links grouped by section
export function getAllLinksGrouped(): Map<string, AdminLink[]> {
  const grouped = new Map<string, AdminLink[]>();
  for (const section of ADMIN_SECTIONS) {
    grouped.set(section.id, section.links);
  }
  return grouped;
}
