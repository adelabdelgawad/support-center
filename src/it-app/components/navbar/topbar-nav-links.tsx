"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Ticket, BarChart } from "lucide-react";

interface NavLink {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navLinks: NavLink[] = [
  { label: "Home", href: "/support-center", icon: Home },
  { label: "Requests", href: "/support-center/requests", icon: Ticket },
  { label: "Reports", href: "/reports", icon: BarChart },
];

interface TopbarNavLinksProps {
  className?: string;
}

export function TopbarNavLinks({ className }: TopbarNavLinksProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {navLinks.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              "hover:bg-white/10",
              isActive
                ? "bg-white/10 text-white"
                : "text-gray-300 hover:text-white"
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
