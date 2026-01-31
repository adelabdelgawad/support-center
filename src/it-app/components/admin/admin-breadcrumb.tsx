"use client";

import { useState, useEffect, startTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { findSectionByHref } from "@/lib/config/admin-sections";
import { ChevronRight, Home } from "lucide-react";

interface AdminBreadcrumbProps {
  className?: string;
}

export function AdminBreadcrumb({ className }: AdminBreadcrumbProps) {
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);

  // Set hydrated state after mount to avoid hydration mismatch
  useEffect(() => {
    startTransition(() => {
      setIsHydrated(true);
    });
  }, []);

  // Don't render until hydrated to avoid mismatch
  if (!isHydrated) {
    return null;
  }

  // Don't show breadcrumb on admin hub home page
  if (pathname === "/admin" || pathname === "/admin/") {
    return null;
  }

  // Find the section and page info for current path
  const currentSection = findSectionByHref(pathname);
  let pageTitle = "Page";

  if (currentSection) {
    const currentLink = currentSection.links.find((link) => link.href === pathname);
    if (currentLink) {
      pageTitle = currentLink.label;
    }
  }

  return (
    <nav className={cn("flex items-center gap-2 text-sm", className)}>
      {/* Admin Hub Link */}
      <Link
        href="/admin"
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>Admin</span>
      </Link>

      {/* Section Link */}
      {currentSection && (
        <>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <Link
            href="/admin"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {currentSection.title}
          </Link>
        </>
      )}

      {/* Current Page */}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
      <span className="text-foreground font-medium">{pageTitle}</span>
    </nav>
  );
}
