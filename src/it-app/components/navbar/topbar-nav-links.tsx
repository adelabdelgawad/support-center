"use client";

/**
 * Topbar Navigation Links
 *
 * THEME-AWARE: Uses CSS variables for consistent theming across light/dark modes
 * - Hover states use --popover/10 for semi-transparent backgrounds
 * - Active states use --primary/10 for accent color
 * - Text colors adapt using --muted-foreground and --foreground
 *
 * DATA SOURCE: Pulls navigation from database pages via NavigationProvider
 * - Shows only top-level pages (parent_id = null) with paths
 * - Respects user's role-based permissions
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNavigationContext } from "./navigation-provider";

interface TopbarNavLinksProps {
  className?: string;
}

export function TopbarNavLinks({ className }: TopbarNavLinksProps) {
  const pathname = usePathname();
  const { pages } = useNavigationContext();

  // Main navigation pages for the top bar:
  // 1. Top-level pages with paths (Dashboard, Portal)
  // 2. Key feature pages from Support Center and Reports (Requests, Reports dashboard)
  const mainNavPages = pages
    .filter((page) => {
      // Must have a path to be navigable
      if (!page.path) return false;

      // Include all top-level pages (parentId === null)
      if (page.parentId === null) return true;

      // Include specific important child pages for main navigation
      // ID 21: Requests (Support Center child)
      // ID 30: Executive Dashboard (Reports child) - shows as "Reports"
      const importantChildPages = [21, 30];
      if (importantChildPages.includes(page.id)) return true;

      return false;
    })
    .sort((a, b) => {
      // Custom sort order for main navigation
      const order = [5, 21, 30, 6]; // Dashboard, Requests, Reports, Portal
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      return a.id - b.id; // Default: sort by ID
    });

  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {mainNavPages.map((page) => {
        const href = `/${page.path}`;

        // Check if current page is active
        const isActive = pathname === href || pathname.startsWith(href + "/");

        // For Reports (ID: 30), show "Reports" instead of "Executive Dashboard"
        const displayTitle = page.id === 30 ? "Reports" : page.title;

        return (
          <Link
            key={page.id}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              "hover:bg-[var(--popover)]/10",
              isActive
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            <span>{displayTitle}</span>
          </Link>
        );
      })}
    </nav>
  );
}
