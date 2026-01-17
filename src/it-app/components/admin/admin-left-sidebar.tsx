"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_SECTIONS, findSectionByHref } from "@/lib/config/admin-sections";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

interface AdminLeftSidebarProps {
  className?: string;
}

export function AdminLeftSidebar({ className }: AdminLeftSidebarProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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

  // Auto-expand section containing current path
  useMemo(() => {
    const currentSection = findSectionByHref(pathname);
    if (currentSection && !expandedSections.has(currentSection.id)) {
      setExpandedSections((prev) => new Set(prev).add(currentSection.id));
    }
  }, [pathname]);

  // Filter sections based on search query
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
          const hasActiveLink = section.links.some((link) => link.href === pathname);

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
                    const isActive = link.href === pathname;

                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={cn(
                            "block px-8 py-1.5 text-sm transition-colors",
                            isActive
                              ? "bg-[var(--sdp-accent)] text-primary-foreground font-medium"
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
