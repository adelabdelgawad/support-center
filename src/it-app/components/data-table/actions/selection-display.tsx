"use client";

import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SelectionDisplayProps {
  selectedCount: number;
  onClearSelection: () => void;
  itemName?: string;
}

export const SelectionDisplay: React.FC<SelectionDisplayProps> = ({
  selectedCount,
  onClearSelection,
  itemName = "item",
}) => {
  const hasSelection = selectedCount > 0;

  // Don't render anything when no selection
  if (!hasSelection) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-primary">
        {selectedCount} {itemName}
        {selectedCount > 1 ? "s" : ""} selected
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClearSelection();
        }}
        title="Clear selection"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
