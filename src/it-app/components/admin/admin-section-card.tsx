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
        "group bg-card rounded-xl border border-border p-5",
        "hover:border-[var(--sdp-accent)] hover:shadow-lg",
        "transition-all duration-200",
        className
      )}
    >
      {/* Card Header with Icon */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-lg shrink-0"
          style={{ backgroundColor: "var(--sdp-accent)" }}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base text-foreground leading-tight">
            {section.title}
          </h3>
        </div>
      </div>

      {/* Card Description */}
      {section.description && (
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          {section.description}
        </p>
      )}

      {/* Divider */}
      <div className="border-t border-border mb-4" />

      {/* Card Links */}
      <ul className="space-y-1">
        {section.links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex items-center text-sm text-muted-foreground transition-colors hover:text-[var(--sdp-accent)] hover:underline py-1"
            >
              <span className="truncate">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
