"use client";

import React, { useTransition, useState, useRef, useCallback } from "react";
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
  debounceMs = 500,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlValue = searchParams?.get(urlParam) || "";
  const [localValue, setLocalValue] = useState(urlValue);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const pushToUrl = useCallback((value: string) => {
    const params = new URLSearchParams(searchParamsRef.current?.toString() || "");
    params.set("page", "1");

    if (value) {
      params.set(urlParam, value);
    } else {
      params.delete(urlParam);
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
    setIsDebouncing(false);
  }, [router, pathname, urlParam]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    setIsDebouncing(true);

    // Clear any existing timer and start a new one from this keystroke
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pushToUrl(newValue);
    }, debounceMs);
  };

  const handleClear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLocalValue("");
    setIsDebouncing(false);
    pushToUrl("");
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
