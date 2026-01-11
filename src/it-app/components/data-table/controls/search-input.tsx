"use client";

import React, { useTransition, useState, useEffect, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchInputProps {
  placeholder?: string;
  className?: string;
  urlParam?: string;
  debounceMs?: number;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  placeholder = "Search...",
  className = "",
  urlParam = "filter",
  debounceMs = 2000,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Get current value from URL
  const urlValue = searchParams?.get(urlParam) || "";

  // Local state for immediate UI updates
  const [localValue, setLocalValue] = useState(urlValue);
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Sync local value with URL value when URL changes externally
  useEffect(() => {
    setLocalValue(urlValue);
  }, [urlValue]);

  // Update URL function
  const updateUrl = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams?.toString() || "");

    // Reset to page 1 when searching
    params.set("page", "1");

    if (value) {
      params.set(urlParam, value);
    } else {
      params.delete(urlParam);
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
      setIsDebouncing(false);
    });
  }, [router, pathname, searchParams, urlParam]);

  // Debounced update to URL
  useEffect(() => {
    if (localValue === urlValue) {
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(() => {
      updateUrl(localValue);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [localValue, debounceMs, updateUrl, urlValue]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
  };

  const handleClear = () => {
    setLocalValue("");
    updateUrl("");
  };

  const showLoading = isPending || isDebouncing;

  return (
    <div className={`relative flex-1 max-w-md ${className}`}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-10 pr-10 h-9"
      />
      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
        {localValue && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClear}
            className="h-6 w-6"
            type="button"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {showLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
};
