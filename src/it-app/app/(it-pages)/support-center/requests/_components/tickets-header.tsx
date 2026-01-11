'use client';

import { ChevronLeft, RefreshCw, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TicketsHeaderProps {
  sidebarVisible: boolean;
  mobileDrawerOpen: boolean;
  activeView: string;
  selectedCount: number;
  hasSolvedTickets?: boolean;
  unsolvedCount?: number; // Summary count for mobile
  onToggleSidebar: () => void;
  onToggleMobileDrawer: () => void;
  onBulkStatusChange?: () => void;
  onClearSelection?: () => void;
}

/**
 * TicketsHeader - SSR-safe responsive header
 *
 * HYDRATION SAFETY:
 * - Renders BOTH mobile and desktop versions in the DOM
 * - Uses CSS classes (md:hidden / hidden md:flex) to control visibility
 * - No conditional rendering based on viewport state
 * - Prevents hydration mismatches on mobile devices
 */
export function TicketsHeader({
  sidebarVisible,
  mobileDrawerOpen,
  activeView,
  selectedCount,
  hasSolvedTickets = false,
  unsolvedCount = 0,
  onToggleSidebar,
  onToggleMobileDrawer,
  onBulkStatusChange,
  onClearSelection,
}: TicketsHeaderProps) {
  return (
    <header className="bg-card border-b border-border">
      {/* Mobile Header - visible on mobile, hidden on md+ */}
      <div className="flex flex-col md:hidden">
        {/* Top row: Menu button + Title + Bulk actions */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 min-w-[44px] flex-shrink-0"
            onClick={onToggleMobileDrawer}
            aria-label="Toggle mobile menu"
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </Button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground">Requests</h1>
            <p className="text-xs text-muted-foreground">
              {unsolvedCount} {unsolvedCount === 1 ? 'unsolved ticket' : 'unsolved tickets'}
            </p>
          </div>

          {/* Bulk Actions - only show when items selected */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant="secondary" className="text-xs px-2 py-1">
                {selectedCount}
              </Badge>
              <Button
                variant="default"
                size="icon"
                className="h-10 w-10 min-w-[44px]"
                onClick={onBulkStatusChange}
                disabled={hasSolvedTickets}
                title={hasSolvedTickets ? 'Cannot change status of solved requests' : undefined}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-w-[44px]"
                onClick={onClearSelection}
              >
                <span className="text-xl leading-none">×</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Header - hidden on mobile, visible on md+ */}
      <div className="hidden md:flex items-center gap-3 px-6 py-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft
            className={cn(
              'h-5 w-5 text-muted-foreground transition-transform duration-300',
              !sidebarVisible && 'rotate-180'
            )}
          />
        </Button>

        <h1 className="flex-1 text-xl font-semibold text-foreground">
          {activeView}
        </h1>

        {/* Bulk Actions */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 mr-4">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {selectedCount}
            </Badge>
            <Button
              className="cursor-pointer"
              variant="default"
              size="sm"
              onClick={onBulkStatusChange}
              disabled={hasSolvedTickets}
              title={hasSolvedTickets ? 'Cannot change status of solved requests' : undefined}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Change Status
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              Clear
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
