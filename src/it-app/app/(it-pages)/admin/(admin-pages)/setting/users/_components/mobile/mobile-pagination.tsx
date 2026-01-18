"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface MobilePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  isLoading?: boolean;
}

/**
 * Mobile-optimized pagination with Previous/Next buttons
 * Clear page indicator and touch-friendly controls (≥44px)
 */
export function MobilePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  isLoading = false,
}: MobilePaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // Calculate shown items range
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const navigateToPage = useCallback(
    (page: number) => {
      if (page < 1 || page > totalPages) return;

      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("page", String(page));
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, totalPages]
  );

  const handlePrevious = useCallback(() => {
    navigateToPage(currentPage - 1);
  }, [navigateToPage, currentPage]);

  const handleNext = useCallback(() => {
    navigateToPage(currentPage + 1);
  }, [navigateToPage, currentPage]);

  // Don't show pagination if only one page
  if (totalPages <= 1) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Showing all {totalItems} {totalItems === 1 ? "user" : "users"}
      </div>
    );
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Page info */}
      <div className="text-center">
        <div className="text-sm font-medium text-foreground">
          Page {currentPage} of {totalPages}
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {startItem}-{endItem} of {totalItems} users
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={!hasPrevious || isLoading}
          className={cn(
            "flex-1 min-h-[44px] font-medium",
            !hasPrevious && "opacity-50"
          )}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>

        <Button
          variant="outline"
          onClick={handleNext}
          disabled={!hasNext || isLoading}
          className={cn(
            "flex-1 min-h-[44px] font-medium",
            !hasNext && "opacity-50"
          )}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Quick page jumps (for multi-page lists) */}
      {totalPages > 3 && (
        <div className="flex items-center justify-center gap-1">
          {currentPage > 2 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateToPage(1)}
              disabled={isLoading}
              className="h-8 w-8 p-0 text-xs"
            >
              1
            </Button>
          )}

          {currentPage > 3 && (
            <span className="text-muted-foreground px-1">...</span>
          )}

          {/* Show current and adjacent pages */}
          {[currentPage - 1, currentPage, currentPage + 1]
            .filter((page) => page > 1 && page < totalPages)
            .map((page) => (
              <Button
                key={page}
                variant={page === currentPage ? "default" : "ghost"}
                size="sm"
                onClick={() => navigateToPage(page)}
                disabled={isLoading || page === currentPage}
                className={cn(
                  "h-8 w-8 p-0 text-xs",
                  page === currentPage && "pointer-events-none"
                )}
              >
                {page}
              </Button>
            ))}

          {currentPage < totalPages - 2 && (
            <span className="text-muted-foreground px-1">...</span>
          )}

          {currentPage < totalPages - 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateToPage(totalPages)}
              disabled={isLoading}
              className="h-8 w-8 p-0 text-xs"
            >
              {totalPages}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
