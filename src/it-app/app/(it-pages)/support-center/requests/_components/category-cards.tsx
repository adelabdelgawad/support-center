'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { FolderOpen, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useViewport } from '@/hooks/use-mobile';

export interface CategoryCount {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  count: number;
}

interface CategoryCardsProps {
  categories: CategoryCount[];
  isLoading?: boolean;
}

export function CategoryCards({
  categories,
  isLoading = false,
}: CategoryCardsProps) {
  const { isMobile } = useViewport();

  // Determine direction from document dir attribute
  const dir = typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';

  // Use counts directly from backend, sorted by count descending
  const sortedCategories = [...categories].sort((a, b) => b.count - a.count);

  // Scroll management
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll position and update button states
  const checkScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Force a reflow to get accurate measurements
    container.getBoundingClientRect();

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const hasLeft = scrollLeft > 0;
    const hasRight = scrollLeft < scrollWidth - clientWidth - 1;

    setCanScrollLeft(hasLeft);
    setCanScrollRight(hasRight);
  }, []);

  // Check scroll on mount and when data changes
  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (!container) return;

    // Observe both the container and its parent for size changes
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(container);
    if (container.parentElement) {
      resizeObserver.observe(container.parentElement);
    }

    // Also listen to window resize events
    window.addEventListener('resize', checkScroll);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkScroll);
    };
  }, [sortedCategories, checkScroll]);

  // Scroll handlers
  const scrollLeft = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: -300, behavior: 'smooth' });
  };

  const scrollRight = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollBy({ left: 300, behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading categories...</span>
      </div>
    );
  }

  if (sortedCategories.length === 0) {
    return null;
  }

  // Get display name based on direction
  const getDisplayName = (category: CategoryCount) => {
    return dir === 'rtl' ? category.nameAr : category.nameEn;
  };

  // Mobile: Compact chip-based filters (pill style)
  if (isMobile) {
    return (
      <div className="mb-2 relative">
        {/* Gradient hints for scrollability */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-[5] pointer-events-none" />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-[5] pointer-events-none" />
        )}

        {/* Horizontal scrolling chip container */}
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="overflow-x-auto scrollbar-none -mx-3 px-3"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-2 min-w-min pb-1">
            {sortedCategories.map((cat) => (
              <div
                key={cat.id}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-muted/50 text-foreground border border-border min-h-[40px] whitespace-nowrap"
              >
                <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="max-w-[120px] truncate">{getDisplayName(cat)}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-0.5 tabular-nums bg-background/50">
                  {cat.count}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator hint (visual only) */}
        {canScrollRight && (
          <div className={cn("absolute right-0 top-1/2 -translate-y-1/2 z-[6] pointer-events-none", dir === 'rtl' ? 'rotate-180' : '')}>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60 animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  // Desktop: Compact inline chips with scroll
  return (
    <div className="mb-2 relative group">
      {/* Left scroll button */}
      {canScrollLeft && (
        <Button
          variant="ghost"
          size="icon"
          onClick={scrollLeft}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full shadow-sm bg-background/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity",
            dir === 'rtl' ? 'right-0' : 'left-0'
          )}
          aria-label="Scroll left"
        >
          {dir === 'rtl' ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </Button>
      )}

      {/* Right scroll button */}
      {canScrollRight && (
        <Button
          variant="ghost"
          size="icon"
          onClick={scrollRight}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full shadow-sm bg-background/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity",
            dir === 'rtl' ? 'left-0' : 'right-0'
          )}
          aria-label="Scroll right"
        >
          {dir === 'rtl' ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>
      )}

      <div className="relative">
        {canScrollLeft && (
          <div className={cn(
            "absolute top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-[5] pointer-events-none",
            dir === 'rtl' ? 'right-0 to-l' : 'left-0'
          )} />
        )}
        {canScrollRight && (
          <div className={cn(
            "absolute top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-[5] pointer-events-none",
            dir === 'rtl' ? 'left-0' : 'right-0'
          )} />
        )}

        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-2 min-w-min py-1">
            {sortedCategories.map((cat) => (
              <div
                key={cat.id}
                className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors cursor-default"
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-foreground truncate max-w-[100px]" title={getDisplayName(cat)}>
                  {getDisplayName(cat)}
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground bg-muted rounded px-1.5 py-0.5 min-w-[20px] text-center">
                  {cat.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
