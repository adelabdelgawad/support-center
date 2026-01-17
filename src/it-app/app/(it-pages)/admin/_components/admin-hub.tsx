"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ADMIN_SECTIONS } from "@/lib/config/admin-sections";
import { Search } from "lucide-react";
import {
  Users,
  Settings,
  Building,
  Settings2,
  Activity,
  type LucideIcon,
} from "lucide-react";

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  Users,
  Settings,
  Building,
  Settings2,
  Activity,
};

export function AdminHub() {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter sections and links based on search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return ADMIN_SECTIONS;
    }

    const query = searchQuery.toLowerCase();

    return ADMIN_SECTIONS
      .map((section) => ({
        ...section,
        links: section.links.filter((link) =>
          link.label.toLowerCase().includes(query) ||
          section.title.toLowerCase().includes(query)
        ),
      }))
      .filter((section) => section.links.length > 0);
  }, [searchQuery]);

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-8">
      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-input bg-card rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sdp-accent)] focus:border-transparent text-foreground placeholder:text-muted-foreground shadow-sm"
          />
        </div>
      </div>

      {/* Horizontal Group List */}
      {filteredSections.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-6">
          {filteredSections.map((section, index) => {
            const Icon = iconMap[section.icon] || Settings;

            return (
              <React.Fragment key={section.id}>
                {/* Separator between groups */}
                {index > 0 && (
                  <div className="hidden sm:block w-px h-8 bg-border" />
                )}

                {/* Group with Icon and Links */}
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className="flex items-center justify-center w-14 h-14 rounded-lg shrink-0"
                    style={{ backgroundColor: "var(--sdp-accent)" }}
                  >
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Group Header and Links */}
                  <div>
                    {/* Group Header */}
                    <h3 className="font-semibold text-base text-foreground mb-3">
                      {section.title}
                    </h3>

                    {/* Group Links - Vertical list within each group */}
                    <ul className="space-y-1.5">
                      {section.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            className="text-sm text-muted-foreground transition-colors hover:text-[var(--sdp-accent)] hover:underline inline-block"
                          >
                            {link.label}
                          </Link>
                          {/* Add separator between links in same group */}
                          {link !== section.links[section.links.length - 1] && (
                            <span className="mx-2 text-muted-foreground/40">|</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        /* No Results */
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-lg text-muted-foreground">
            No settings found matching <span className="font-medium">"{searchQuery}"</span>
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Try different keywords or browse the categories below
          </p>
        </div>
      )}
    </div>
  );
}
