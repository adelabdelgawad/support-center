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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage your service desk configuration and settings
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sdp-accent)] focus:border-transparent"
        />
      </div>

      {/* Admin Section Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredSections.map((section) => (
          <AdminSectionCard key={section.id} section={section} />
        ))}
      </div>

      {/* No Results */}
      {filteredSections.length === 0 && searchQuery.trim() && (
        <div className="text-center py-12">
          <p className="text-gray-500">No settings found matching "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
}
