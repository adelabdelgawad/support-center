"use client";

/**
 * Admin Left Sidebar
 *
 * HYDRATION FIX: Adopts network_manager's server-first pattern
 * - Server computes navigation state before rendering
 * - Client receives exact state as props (no mismatches)
 * - Clear hydration boundary with isHydrated flag
 */

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { findSectionByHref, calculateExpandedSections } from "@/lib/utils/admin-navigation-utils";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { AdminSection } from "@/lib/utils/admin-navigation-utils";

interface AdminLeftSidebarProps {
  className?: string;
  // Server-provided props for hydration-safe rendering
  serverNavigation?: AdminSection[];
  serverExpandedSections?: Set<string>;
  serverActiveLink?: string | null;
  serverPathname?: string;
}

export function AdminLeftSidebar({
  className,
  serverNavigation,
  serverExpandedSections = new Set(),
  serverActiveLink = null,
  serverPathname = "/admin",
}: AdminLeftSidebarProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  // Initialize with server-provided state
  const [navigation] = useState<AdminSection[]>(serverNavigation || []);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(serverExpandedSections);

  // HYDRATION FIX: Use server pathname before hydration, client pathname after
  const currentPathname = isHydrated ? pathname : serverPathname;

  // Set hydrated state after mount to avoid hydration mismatch
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Update expanded sections when pathname changes (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;

    const newExpandedSections = calculateExpandedSections(navigation, pathname);
    setExpandedSections(newExpandedSections);
  }, [pathname, isHydrated, navigation]);

  // Filter sections based on search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return navigation;
    }

    const query = searchQuery.toLowerCase();

    return navigation
      .map((section) => ({
        ...section,
        links: section.links.filter((link) =>
          link.label.toLowerCase().includes(query) ||
          section.title.toLowerCase().includes(query)
        ),
      }))
      .filter((section) => section.links.length > 0);
  }, [searchQuery, navigation]);

  return (
    <aside
      className={cn(
        "w-60 bg-card border-r border-border flex flex-col",
        "overflow-hidden",
        className
      )}
    >
      {/* Search Box */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sdp-accent)] focus:border-transparent text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-2">
        {filteredSections.map((section) => {
          const isExpanded = expandedSections.has(section.id) || searchQuery.trim() !== "";
          // HYDRATION FIX: Active state works on server AND client
          const hasActiveLink = section.links.some((link) => link.href === currentPathname);

          return (
            <div key={section.id} className="mb-1">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors",
                  hasActiveLink && "bg-[var(--sdp-accent)]/10",
                  "hover:bg-accent"
                )}
              >
                <span className={cn(hasActiveLink && "text-[var(--sdp-accent)]")}>
                  {section.title}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {/* Section Links */}
              {isExpanded && (
                <ul className="mt-1 space-y-0.5">
                  {section.links.map((link) => {
                    // HYDRATION FIX: Active state works on server AND client
                    const isActive = link.href === currentPathname;

                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={cn(
                            "block px-8 py-1.5 text-sm transition-colors rounded-md mx-2",
                            isActive
                              ? "bg-[var(--sdp-accent)]/20 text-[var(--sdp-accent)] font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          )}
                        >
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
