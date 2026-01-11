"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { OfficeTopBar } from "./office-top-bar";
import { OfficeSidebar, type NavItem } from "./office-sidebar";
import { OfficeCommandBar, type CommandBarAction } from "./office-command-bar";
import { OfficeRightRail } from "./office-right-rail";

interface OfficeShellProps {
  appTitle?: string;
  user: {
    fullName?: string;
    email?: string;
    avatarUrl?: string;
  };
  navigation: NavItem[];
  commandBarActions?: CommandBarAction[];
  commandBarOverflowActions?: CommandBarAction[];
  breadcrumbs?: React.ReactNode;
  rightRailContent?: React.ReactNode;
  rightRailTitle?: string;
  showRightRail?: boolean;
  onLogout?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function OfficeShell({
  appTitle = "IT Support Center",
  user,
  navigation,
  commandBarActions,
  commandBarOverflowActions,
  breadcrumbs,
  rightRailContent,
  rightRailTitle,
  showRightRail = false,
  onLogout,
  children,
  className,
}: OfficeShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [rightRailOpen, setRightRailOpen] = React.useState(showRightRail);

  React.useEffect(() => {
    setRightRailOpen(showRightRail);
  }, [showRightRail]);

  return (
    <div className={cn("h-screen flex flex-col overflow-hidden", className)}>
      {/* Top Navigation Bar */}
      <OfficeTopBar
        appTitle={appTitle}
        user={user}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <OfficeSidebar
          navigation={navigation}
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Center Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Command Bar */}
          {(commandBarActions || breadcrumbs) && (
            <OfficeCommandBar
              actions={commandBarActions}
              overflowActions={commandBarOverflowActions}
              breadcrumbs={breadcrumbs}
            />
          )}

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-muted/30">
            {children}
          </main>
        </div>

        {/* Right Rail / Task Pane */}
        {rightRailContent && (
          <OfficeRightRail
            isOpen={rightRailOpen}
            onClose={() => setRightRailOpen(false)}
            title={rightRailTitle}
          >
            {rightRailContent}
          </OfficeRightRail>
        )}
      </div>
    </div>
  );
}
