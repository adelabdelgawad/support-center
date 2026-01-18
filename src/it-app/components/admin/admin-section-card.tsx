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
    <div className={cn("mb-6", className)}>
      {/* Section Title with Icon */}
      <div className="flex items-center gap-2 mb-6">
        <Icon className="w-8 h-8 text-[var(--sdp-accent)]" />
        <h3 className="font-semibold text-xl text-foreground">
          {section.title}
        </h3>
      </div>

      {/* Horizontal Links with Pipe Separators */}
      <div className="flex items-center flex-wrap gap-2 text-sm">
        {section.links.map((link, index) => (
          <div key={link.href} className="flex items-center gap-2">
            <Link
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-[var(--sdp-accent)] hover:underline"
            >
              {link.label}
            </Link>
            {index < section.links.length - 1 && (
              <span className="text-muted-foreground">|</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
