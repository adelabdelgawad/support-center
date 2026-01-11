"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { ChevronRight, ChevronDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

export interface NavItem {
  id: string;
  title: string;
  path?: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

interface OfficeSidebarProps {
  navigation: NavItem[];
  isCollapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function OfficeSidebar({
  navigation,
  isCollapsed = false,
  onToggle,
  className,
}: OfficeSidebarProps) {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(
    new Set()
  );

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isActive = React.useCallback((path: string | null | undefined) => {
    if (!path) return false;
    return pathname === path || pathname.startsWith(`${path}/`);
  }, [pathname]);

  const hasActiveChild = React.useCallback((item: NavItem): boolean => {
    if (item.children.length === 0) return false;
    return item.children.some(
      (child) => {
        if (isActive(child.path)) return true;
        if (child.children.length === 0) return false;
        return child.children.some(
          (grandchild) => isActive(grandchild.path)
        );
      }
    );
  }, [isActive]);

  // Auto-expand parent if child is active
  React.useEffect(() => {
    const itemsToExpand = new Set<string>();
    navigation.forEach((item) => {
      if (hasActiveChild(item)) {
        itemsToExpand.add(item.id);
      }
    });
    setExpandedItems(itemsToExpand);
  }, [pathname, navigation, hasActiveChild]);

  const renderNavItem = (item: NavItem, level: number = 0) => {
    const active = isActive(item.path);
    const expanded = expandedItems.has(item.id);
    const hasChildren = item.children.length > 0;
    const hasActiveDescendant = hasActiveChild(item);

    const NavContent = (
      <div
        className={cn(
          "flex items-center gap-3 w-full",
          isCollapsed && level === 0 && "justify-center"
        )}
      >
        {item.icon && (
          <DynamicIcon
            name={item.icon}
            className={cn(
              "h-5 w-5 shrink-0",
              active && "text-primary",
              !active && "text-muted-foreground"
            )}
          />
        )}
        {!isCollapsed && (
          <>
            <span
              className={cn(
                "flex-1 text-sm font-semibold truncate",
                level > 0 && "text-sm font-medium"
              )}
            >
              {item.title}
            </span>
            {hasChildren && (
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 duration-fast ease-fluent-standard",
                  expanded && "rotate-90"
                )}
              />
            )}
          </>
        )}
      </div>
    );

    const buttonClasses = cn(
      "w-full justify-start px-3 py-2.5 duration-faster ease-fluent-standard",
      level === 0 && "h-12",
      level > 0 && "h-10",
      active && "bg-primary/10 text-primary font-semibold",
      !active && hasActiveDescendant && "bg-muted",
      !active && !hasActiveDescendant && "hover:bg-muted",
      isCollapsed && level === 0 && "px-0"
    );

    const buttonContent = (
      <Button
        variant="ghost"
        className={buttonClasses}
        asChild={!!item.path && !hasChildren}
        onClick={() => {
          if (hasChildren) {
            toggleExpanded(item.id);
          }
        }}
      >
        {item.path && !hasChildren ? (
          <Link href={item.path}>{NavContent}</Link>
        ) : (
          <div>{NavContent}</div>
        )}
      </Button>
    );

    return (
      <div key={item.id} className="w-full">
        {isCollapsed && level === 0 ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <span className="font-semibold">{item.title}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          buttonContent
        )}

        {/* Render children if expanded */}
        {!isCollapsed && hasChildren && expanded && (
          <div className={cn("pl-6 mt-1 space-y-1", level > 0 && "pl-4")}>
            {item.children.map((child) => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "office-nav-surface flex flex-col border-r border-border duration-normal ease-fluent-standard",
        isCollapsed ? "office-sidebar-collapsed" : "office-sidebar-expanded",
        className
      )}
    >
      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2">
        <div className="space-y-1">
          {navigation.map((item) => renderNavItem(item))}
        </div>
      </nav>

      {/* Toggle Button */}
      {onToggle && !isCollapsed && (
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={onToggle}
          >
            <ChevronRight className="mr-2 h-4 w-4 rotate-180" />
            Collapse
          </Button>
        </div>
      )}
    </aside>
  );
}
