"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, RefreshCw } from "lucide-react";
import { AddTypeButton } from "../actions/add-type-button";
import type { RequestType } from "@/types/request-types";
import { cn } from "@/lib/utils";

interface MobileToolbarProps {
  onRefresh: () => void;
  addType: (newType: RequestType) => void;
  isRefreshing?: boolean;
}

/**
 * Mobile-optimized toolbar with search, add type, and refresh
 * Touch-friendly with expandable search
 */
export function MobileToolbar({
  onRefresh,
  addType,
  isRefreshing = false,
}: MobileToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(
    searchParams?.get("name") || ""
  );

  const handleSearchSubmit = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");

      if (value.trim()) {
        params.set("name", value.trim());
      } else {
        params.delete("name");
      }

      // Reset to page 1 when search changes
      params.set("page", "1");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchValue("");
    setIsSearchOpen(false);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("name");
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearchSubmit(searchValue);
        setIsSearchOpen(false);
      }
    },
    [searchValue, handleSearchSubmit]
  );

  return (
    <div className="sticky top-0 z-20 bg-background border-b shadow-sm">
      {isSearchOpen ? (
        // Search mode - full width search input
        <div className="flex items-center gap-2 p-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search types..."
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-10 pr-10 h-11"
              autoFocus
            />
            {searchValue && (
              <button
                onClick={handleSearchClear}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsSearchOpen(false)}
            className="h-11 w-11 shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        // Normal mode - action buttons
        <div className="flex items-center justify-between gap-2 p-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsSearchOpen(true)}
              className="h-11 w-11 shrink-0"
            >
              <Search className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn("h-11 w-11 shrink-0", isRefreshing && "animate-spin")}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <AddTypeButton onAdd={onRefresh} addType={addType} />
        </div>
      )}
    </div>
  );
}
