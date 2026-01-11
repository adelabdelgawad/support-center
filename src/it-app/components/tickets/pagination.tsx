'use client';

import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useViewport } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
}

export function TicketsPagination({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const { isMobile } = useViewport();
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handlePageSizeChange = (newSize: string) => {
    onPageSizeChange?.(Number(newSize));
  };

  // Mobile-optimized pagination with "Load More" button
  if (isMobile) {
    const hasMore = currentPage < totalPages;

    return (
      <div className="flex flex-col gap-3 px-4 py-4 bg-background">
        {/* Info row: Items shown and page selector */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {startItem}-{endItem} of {totalItems}
          </span>
          {totalPages > 1 && (
            <span>
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>

        {/* Load More button - prominent and touch-friendly */}
        {hasMore && (
          <Button
            variant="outline"
            size="lg"
            onClick={() => onPageChange(currentPage + 1)}
            className="w-full h-12 text-sm font-medium"
          >
            Load More
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}

        {/* Previous page button - show when not on first page */}
        {currentPage > 1 && !hasMore && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            className="w-full h-10 text-xs"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous Page
          </Button>
        )}

        {/* Both prev/next when in middle of pages */}
        {currentPage > 1 && hasMore && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              className="flex-1 h-10 text-xs"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(1)}
              className="flex-1 h-10 text-xs"
              disabled={currentPage === 1}
            >
              Back to Start
            </Button>
          </div>
        )}

        {/* Items per page selector - compact */}
        {onPageSizeChange && (
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">Items per page:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[70px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  }

  // Desktop pagination - original design
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-background border-t border-border">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {totalItems} entries
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {/* Go to First Page Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          title="Go to first page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        {/* Previous Page Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {/* Page numbers */}
        <div className="flex gap-1">
          {[...Array(totalPages)].map((_, i) => {
            const pageNum = i + 1;
            if (
              pageNum === 1 ||
              pageNum === totalPages ||
              (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
            ) {
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className="min-w-[32px]"
                >
                  {pageNum}
                </Button>
              );
            } else if (
              pageNum === currentPage - 2 ||
              pageNum === currentPage + 2
            ) {
              return (
                <span
                  key={pageNum}
                  className="px-2 flex items-center text-muted-foreground"
                >
                  ...
                </span>
              );
            }
            return null;
          })}
        </div>
        {/* Next Page Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {/* Go to Last Page Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          title="Go to last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
