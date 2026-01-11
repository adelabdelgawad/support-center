"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export interface CommandBarAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "subtle";
  visible?: boolean;
}

interface OfficeCommandBarProps {
  actions?: CommandBarAction[];
  overflowActions?: CommandBarAction[];
  breadcrumbs?: React.ReactNode;
  className?: string;
}

export function OfficeCommandBar({
  actions = [],
  overflowActions = [],
  breadcrumbs,
  className,
}: OfficeCommandBarProps) {
  const visibleActions = actions.filter(
    (action) => action.visible !== false
  );
  const visibleOverflowActions = overflowActions.filter(
    (action) => action.visible !== false
  );

  const getButtonVariant = (actionVariant?: string) => {
    switch (actionVariant) {
      case "primary":
        return "default";
      case "subtle":
        return "ghost";
      default:
        return "outline";
    }
  };

  return (
    <div
      className={cn(
        "office-commandbar sticky top-[var(--office-topbar-height)] z-40 flex items-center justify-between border-b border-border bg-background px-4",
        className
      )}
    >
      {/* Left Section: Breadcrumbs or Title */}
      <div className="flex items-center gap-3 overflow-hidden">
        {breadcrumbs && (
          <div className="text-sm text-muted-foreground overflow-hidden">
            {breadcrumbs}
          </div>
        )}
      </div>

      {/* Right Section: Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Primary Actions */}
        {visibleActions.map((action) => (
          <Button
            key={action.id}
            variant={getButtonVariant(action.variant)}
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              "command-bar-item gap-2",
              action.variant === "primary" && "shadow-fluent-2"
            )}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}

        {/* Overflow Menu */}
        {visibleOverflowActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {visibleOverflowActions.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.icon && (
                    <span className="mr-2">{action.icon}</span>
                  )}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
