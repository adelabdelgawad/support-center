'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Building2, HelpCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRequestsListContext } from '../_context/requests-list-context';
import { useViewport } from '@/hooks/use-mobile';

interface BusinessUnitCardsProps {
  selectedIds?: number[];
  onCardClick: (id: number) => void;
  sidebarVisible?: boolean;
}

export function BusinessUnitCards({
  selectedIds = [],
  onCardClick,
  sidebarVisible = true,
}: BusinessUnitCardsProps) {
  const { isMobile } = useViewport();

  // Get data from context (all server-side fetched, no client-side fetching on mount)
  // Business unit counts are now filtered by current view on the backend
  const {
    allBusinessUnits,
    unassignedCount,
    isLoading: ticketsLoading,
    isBusinessUnitsValidating
  } = useRequestsListContext();

  const isLoading = ticketsLoading;

  // Use counts directly from backend (already filtered by current view), sorted by count descending
  const businessUnits = [...allBusinessUnits].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

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
  }, [businessUnits, unassignedCount, checkScroll]);

  // Recalculate scroll when sidebar visibility changes
  // Check multiple times to ensure we catch the layout change
  useEffect(() => {
    // Immediate check
    checkScroll();

    // Check after animation frame (layout has started changing)
    const raf = requestAnimationFrame(() => {
      checkScroll();
    });

    // Check during transition (150ms - midpoint)
    const timer1 = setTimeout(() => {
      checkScroll();
    }, 150);

    // Check after transition completes (300ms)
    const timer2 = setTimeout(() => {
      checkScroll();
    }, 300);

    // Final check to be safe (350ms)
    const timer3 = setTimeout(() => {
      checkScroll();
    }, 350);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [sidebarVisible, checkScroll]);

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
        <span>Loading business units...</span>
      </div>
    );
  }

  if (businessUnits.length === 0 && unassignedCount === 0) {
    return null;
  }

  // Mobile: Compact chip-based filters (pill style)
  if (isMobile) {
    return (
      <div className="mb-3 relative">
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
            {/* Unassigned Chip */}
            <button
              onClick={() => onCardClick(-1)}
              aria-label={`Filter by Unassigned, ${unassignedCount} tickets`}
              aria-pressed={selectedIds.includes(-1)}
              className={cn(
                'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                'min-h-[40px] whitespace-nowrap',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none',
                selectedIds.includes(-1)
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-foreground hover:bg-muted border border-border'
              )}
            >
              <HelpCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Unassigned</span>
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] px-1.5 py-0 h-4 ml-0.5 tabular-nums',
                  selectedIds.includes(-1)
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-background/50'
                )}
              >
                {unassignedCount}
              </Badge>
            </button>

            {/* Business Unit Chips */}
            {businessUnits.map((bu) => (
              <button
                key={bu.id}
                onClick={() => onCardClick(bu.id)}
                aria-label={`Filter by ${bu.name}, ${bu.count} tickets`}
                aria-pressed={selectedIds.includes(bu.id)}
                className={cn(
                  'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                  'min-h-[40px] whitespace-nowrap',
                  'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none',
                  selectedIds.includes(bu.id)
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-foreground hover:bg-muted border border-border'
                )}
              >
                <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="max-w-[120px] truncate">{bu.name}</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px] px-1.5 py-0 h-4 ml-0.5 tabular-nums',
                    selectedIds.includes(bu.id)
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-background/50'
                  )}
                >
                  {bu.count}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Scroll indicator hint (visual only) */}
        {canScrollRight && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 z-[6] pointer-events-none">
            <ChevronRight className="h-4 w-4 text-muted-foreground/60 animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  // Desktop: Original card-based layout (unchanged)
  return (
    <div className="mb-4 relative group">
      {/* Left scroll button */}
      {canScrollLeft && (
        <Button
          variant="outline"
          size="icon"
          onClick={scrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-background/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Right scroll button */}
      {canScrollRight && (
        <Button
          variant="outline"
          size="icon"
          onClick={scrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-background/95 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Scroll container with gradient masks */}
      <div className="relative">
        {/* Left gradient fade */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-background to-transparent z-[5] pointer-events-none" />
        )}

        {/* Right gradient fade */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-background to-transparent z-[5] pointer-events-none" />
        )}

        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20"
        >
          <div className="flex gap-3 min-w-min">
            {/* Unassigned Card */}
            <button
              onClick={() => onCardClick(-1)}
              aria-label={`Filter by Unassigned, ${unassignedCount} tickets`}
              aria-pressed={selectedIds.includes(-1)}
              className={cn(
                'flex-shrink-0 w-[180px] border rounded-lg p-4 hover:bg-accent/50 transition-colors text-left',
                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none',
                selectedIds.includes(-1) && 'border-primary bg-primary/10'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  Unassigned
                </span>
              </div>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {unassignedCount}
              </Badge>
            </button>

            {/* Business Unit Cards */}
            {businessUnits.map((bu) => (
              <button
                key={bu.id}
                onClick={() => onCardClick(bu.id)}
                aria-label={`Filter by ${bu.name}, ${bu.count} tickets`}
                aria-pressed={selectedIds.includes(bu.id)}
                className={cn(
                  'flex-shrink-0 w-[180px] border rounded-lg p-4 hover:bg-accent/50 transition-colors text-left',
                  'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none',
                  selectedIds.includes(bu.id) && 'border-primary bg-primary/10'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <span className="font-semibold text-foreground truncate">
                    {bu.name}
                  </span>
                </div>
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {bu.count}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
