"use client";

import React, { useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useQueryState, parseAsInteger } from "nuqs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationProps {
  currentPage?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage: initialPage,
  pageSize: initialPageSize,
  totalItems = 0,
  totalPages: initialTotalPages,
}) => {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const [limit, setLimit] = useQueryState(
    "limit",
    parseAsInteger.withDefault(10)
  );

  const [, startTransition] = useTransition();

  // Use props if provided, otherwise use URL state
  const currentPage = initialPage ?? page;
  const pageSize = initialPageSize ?? limit;
  const totalPages = initialTotalPages ?? Math.ceil(totalItems / pageSize);

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handlePageChange = async (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      startTransition(async () => {
        await setPage(newPage === 1 ? null : newPage);
      });
    }
  };

  const handlePageSizeChange = async (newSize: string) => {
    startTransition(async () => {
      await setLimit(Number(newSize) === 10 ? null : Number(newSize));
      await setPage(null); // Reset to page 1
    });
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-background border-t border-border">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {totalItems} entries
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page:</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {/* Go to First Page Button */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          title="Go to first page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        {/* Previous Page Button */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => handlePageChange(currentPage - 1)}
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
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
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
          size="icon-sm"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {/* Go to Last Page Button */}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          title="Go to last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
