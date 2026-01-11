"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onRefresh: () => void;
  _requireSelection?: boolean; // Optional - for backward compatibility
  isLoading?: boolean; // Show spinner when validating/loading
}

export const RefreshButton: React.FC<RefreshButtonProps> = ({
  onRefresh,
  isLoading = false,
}) => {
  return (
    <Button
      onClick={onRefresh}
      variant="outline"
      size="sm"
      className="gap-2"
      title="Refresh table _data"
      disabled={isLoading}
    >
      <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
      Refresh
    </Button>
  );
};
