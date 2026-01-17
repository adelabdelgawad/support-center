"use client";

import { useState, useMemo } from "react";
import { AdminSectionCard } from "@/components/admin/admin-section-card";
import { ADMIN_SECTIONS } from "@/lib/config/admin-sections";
import { Search } from "lucide-react";

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
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground mb-2">
          Admin Settings
        </h1>
        <p className="text-base text-muted-foreground">
          Configure and manage your service desk settings
        </p>
      </div>

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

      {/* Admin Section Cards Grid */}
      {filteredSections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
