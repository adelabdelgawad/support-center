"use client";

/**
 * Topbar Navigation Links
 *
 * THEME-AWARE: Uses CSS variables for consistent theming across light/dark modes
 * - Hover states use --popover/10 for semi-transparent backgrounds
 * - Active states use --primary/10 for accent color
 * - Text colors adapt using --muted-foreground and --foreground
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLink {
  label: string;
  href: string;
}

const navLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Requests", href: "/support-center/requests" },
  { label: "Reports", href: "/reports" },
];

interface TopbarNavLinksProps {
  className?: string;
}

export function TopbarNavLinks({ className }: TopbarNavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {navLinks.map((link) => {
        // Special handling for Home link
        let isActive = false;
        if (link.href === "/") {
          // Home is active on "/" or "/support-center" (but not sub-paths)
          isActive = pathname === "/" || pathname === "/support-center";
        } else {
          // Other links: exact match or starts with href + "/"
          isActive = pathname === link.href || pathname.startsWith(link.href + "/");
        }

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              "hover:bg-[var(--popover)]/10",
              isActive
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
