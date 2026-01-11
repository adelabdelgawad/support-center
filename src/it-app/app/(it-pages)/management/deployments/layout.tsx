"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Monitor, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeploymentsLayoutProps {
  children: React.ReactNode;
}

export default function DeploymentsLayout({ children }: DeploymentsLayoutProps) {
  const pathname = usePathname();

  const tabs = [
    {
      label: "Devices",
      href: "/management/deployments",
      icon: Monitor,
      isActive: pathname === "/management/deployments",
    },
    {
      label: "Jobs",
      href: "/management/deployments/jobs",
      icon: Briefcase,
      isActive: pathname === "/management/deployments/jobs",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab Navigation */}
      <div className="bg-card border-b shrink-0">
        <div className="flex h-12 px-2 gap-2 items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  tab.isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-4 overflow-auto">
        {children}
      </div>
    </div>
  );
}
