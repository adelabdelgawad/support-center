"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DynamicTableBarProps {
  left?: ReactNode;
  middle?: ReactNode;
  right?: ReactNode;
  variant?: "header" | "controller";
  hasSelection?: boolean;
}

export const DynamicTableBar: React.FC<DynamicTableBarProps> = ({
  left,
  middle,
  right,
  variant = "header",
  hasSelection = false,
}) => {
  return (
    <div
      className={cn(
        "border px-4 py-2 transition-colors",
        variant === "controller"
          ? hasSelection
            ? "bg-primary/10 border-primary/20"
            : "bg-muted/40 border-border"
          : "bg-muted/40 border-border"
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left Section */}
        <div className="flex items-center gap-2 flex-1">{left}</div>

        {/* Middle Section */}
        {middle && (
          <div className="flex items-center gap-2 flex-1 justify-center">
            {middle}
          </div>
        )}

        {/* Right Section */}
        <div className="flex items-center gap-2 flex-1 justify-end">{right}</div>
      </div>
    </div>
  );
};
