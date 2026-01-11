"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface OfficeRightRailProps {
  isOpen?: boolean;
  onClose?: () => void;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

export function OfficeRightRail({
  isOpen = false,
  onClose,
  title = "Properties",
  children,
  className,
}: OfficeRightRailProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={cn(
          "fixed inset-0 bg-black/20 z-40 lg:hidden",
          "duration-normal ease-fluent-decelerate",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Right Rail Panel */}
      <aside
        className={cn(
          "fixed right-0 top-[var(--office-topbar-height)] bottom-0 lg:relative lg:top-0 office-rightrail bg-background border-l border-border flex flex-col z-50 duration-normal ease-fluent-decelerate shadow-fluent-16 lg:shadow-none",
          isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6"
              onClick={onClose}
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {children || (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <p className="text-sm">No properties to display</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// Property Group Component for consistent styling
interface PropertyGroupProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function PropertyGroup({
  title,
  children,
  className,
}: PropertyGroupProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {title && (
        <>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h3>
          <Separator />
        </>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Property Item Component
interface PropertyItemProps {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PropertyItem({
  label,
  value,
  children,
  className,
}: PropertyItemProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-xs font-semibold text-foreground">{label}</label>
      {value && <div className="text-sm text-muted-foreground">{value}</div>}
      {children}
    </div>
  );
}
