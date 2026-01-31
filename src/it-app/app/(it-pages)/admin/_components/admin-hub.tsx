"use client";

import { useState, useMemo } from "react";
import { AdminSectionCard } from "@/components/admin/admin-section-card";
import type { AdminSection } from "@/lib/config/admin-sections";
import type { Page } from "@/types/pages";
import { Search } from "lucide-react";

interface AdminHubProps {
  pages: Page[];
}

// Map parent page icons and descriptions
const PARENT_PAGE_CONFIG: Record<
  number,
  { icon: string; description: string; order: number }
> = {
  1: {
    // Settings
    icon: "Settings2",
    description: "System messages and events",
    order: 4,
  },
  2: {
    // Support Center
    icon: "Headphones",
    description: "Support center and request management",
    order: 1,
  },
  3: {
    // Reports
    icon: "BarChart",
    description: "Reports and analytics",
    order: 2,
  },
  4: {
    // Management
    icon: "Activity",
    description: "System operations and monitoring",
    order: 3,
  },
};

export function AdminHub({ pages }: AdminHubProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Build sections from pages dynamically
  const adminSections = useMemo((): AdminSection[] => {
    // Group pages by parent
    const parentPages = pages.filter((p) => !p.parentId && p.path === null);
    const childPages = pages.filter((p) => p.parentId);

    return parentPages
      .map((parent) => {
        const children = childPages
          .filter((child) => child.parentId === parent.id)
          .map((child) => ({
            label: child.title,
            href: `/${child.path}`,
          }));

        const config = PARENT_PAGE_CONFIG[parent.id] || {
          icon: "Settings",
          description: parent.description || "",
          order: 999,
        };

        return {
          id: `section-${parent.id}`,
          title: parent.title,
          icon: config.icon,
          description: config.description,
          links: children,
          order: config.order,
        };
      })
      .filter((section) => section.links.length > 0) // Only show sections with links
      .sort((a, b) => a.order - b.order); // Sort by order
  }, [pages]);

  // Filter sections and links based on search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return adminSections;
    }

    const query = searchQuery.toLowerCase();

    return adminSections
      .map((section) => ({
        ...section,
        links: section.links.filter(
          (link) =>
            link.label.toLowerCase().includes(query) ||
            section.title.toLowerCase().includes(query)
        ),
      }))
      .filter((section) => section.links.length > 0);
  }, [searchQuery, adminSections]);

  return (
    <div className="p-4 h-full">
      <div className="bg-card rounded-lg border border-border h-full overflow-auto">
        {/* Header Card */}
        <div className="bg-muted/50 px-6 py-4 border-b border-border">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Admin Settings</span>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-2 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sdp-accent)] focus:border-transparent text-foreground placeholder:text-muted-foreground shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">

        {/* Admin Sections */}
        {filteredSections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredSections.map((section) => (
              <AdminSectionCard key={section.id} section={section} />
            ))}
          </div>
        ) : (
          /* No Results */
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg text-muted-foreground">
              No settings found matching <span className="font-medium">&ldquo;{searchQuery}&rdquo;</span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Try different keywords or browse the categories below
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
