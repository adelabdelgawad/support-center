"use client";

import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface MobileToolbarProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function MobileToolbar({ onRefresh, isRefreshing = false }: MobileToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentFilter = searchParams?.get("filter") || "";
  const [searchValue, setSearchValue] = useState(currentFilter);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (searchValue) {
      params.set("filter", searchValue);
    } else {
      params.delete("filter");
    }
    params.set("page", "1");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [searchValue, searchParams, pathname, router]);

  return (
    <div className="sticky top-0 z-20 bg-background border-b p-2">
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-8 h-9"
          />
        </div>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isRefreshing || isPending}
          className="h-9 w-9 shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", (isRefreshing || isPending) && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
