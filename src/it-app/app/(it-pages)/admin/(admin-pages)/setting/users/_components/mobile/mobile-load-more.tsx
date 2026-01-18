"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useCallback } from "react";

interface MobileLoadMoreProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  isLoading?: boolean;
}

/**
 * Mobile-optimized "Load More" button for pagination
 * Replaces numbered pagination on mobile screens
 */
export function MobileLoadMore({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  isLoading = false,
}: MobileLoadMoreProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasMore = currentPage < totalPages;
  const currentCount = Math.min(currentPage * pageSize, totalItems);

  const handleLoadMore = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("page", String(currentPage + 1));
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams, currentPage]);

  if (!hasMore) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Showing all {totalItems} users
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-2">
      <Button
        variant="outline"
        onClick={handleLoadMore}
        disabled={isLoading}
        className="w-full min-h-[44px]"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            Load More ({currentCount} of {totalItems})
          </>
        )}
      </Button>
      <div className="text-xs text-center text-muted-foreground">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
}
