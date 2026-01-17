"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AdminSection } from "@/lib/config/admin-sections";
import {
  Users,
  Settings,
  Building,
  Settings2,
  Activity,
  type LucideIcon,
} from "lucide-react";

interface AdminSectionCardProps {
  section: AdminSection;
  className?: string;
}

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  Users,
  Settings,
  Building,
  Settings2,
  Activity,
};

export function AdminSectionCard({ section, className }: AdminSectionCardProps) {
  const Icon = iconMap[section.icon] || Settings;

  return (
    <div
      className={cn(
        "bg-[var(--sdp-card-bg)] rounded-lg border border-gray-200 p-4",
        "hover:shadow-md transition-shadow",
        className
      )}
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-md"
          style={{ backgroundColor: "var(--sdp-accent)" }}
        >
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3
          className="font-semibold"
          style={{ color: "var(--sdp-admin-card-title)" }}
        >
          {section.title}
        </h3>
      </div>

      {/* Card Description */}
      {section.description && (
        <p className="text-sm text-gray-600 mb-3">{section.description}</p>
      )}

      {/* Card Links */}
      <ul className="space-y-1">
        {section.links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={cn(
                "text-sm transition-colors",
                "hover:underline",
                "style-[var(--sdp-admin-card-link)]",
                "hover:style-[var(--sdp-admin-card-link-hover)]"
              )}
              style={{ color: "var(--sdp-admin-card-link)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--sdp-admin-card-link-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--sdp-admin-card-link)";
              }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
