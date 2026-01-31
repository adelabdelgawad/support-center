"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReportsFilterProvider } from "./_context/reports-filter-context";
import { ReportsControlsBar } from "./_components/reports-controls-bar";

interface ReportsLayoutProps {
  children: React.ReactNode;
}

// Map of slugs to active navigation index
const getActiveIndex = (path: string): number => {
  const map: Record<string, number> = {
    "/reports/operations": 0,
    "/reports/sla": 1,
    "/reports/agents": 2,
    "/reports/volume": 3,
    "/reports/outshift": 4,
  };
  // Find the closest match in the map
  const matchingKey = Object.keys(map).find(key => path.startsWith(key));
  return matchingKey !== undefined ? map[matchingKey] : -1;
};

const navItems = [
  { href: "/reports/operations", label: "Operations" },
  { href: "/reports/sla", label: "SLA Compliance" },
  { href: "/reports/agents", label: "Agent Performance" },
  { href: "/reports/volume", label: "Volume Analysis" },
  { href: "/reports/outshift", label: "Outshift Report" },
];

// Pages that show the controls bar (sub-report pages, not the main dashboard or saved)
const PAGES_WITH_CONTROLS = [
  "/reports/operations",
  "/reports/sla",
  "/reports/agents",
  "/reports/volume",
  "/reports/outshift",
];

export default function ReportsLayout({ children }: ReportsLayoutProps) {
  const pathname = usePathname();
  const activeIndex = getActiveIndex(pathname);
  const showControls = PAGES_WITH_CONTROLS.some(p => pathname.startsWith(p));

  return (
    <ReportsFilterProvider>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        {/* Navigation Menu */}
        <nav>
          <div className="flex items-center gap-6 border-b">
            {navItems.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  index === activeIndex
                    ? "text-foreground after:content-[''] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:bg-foreground"
                    : "text-foreground hover:text-foreground/80"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Shared Controls Bar */}
        {showControls && <ReportsControlsBar />}

        {children}
      </div>
    </ReportsFilterProvider>
  );
}
