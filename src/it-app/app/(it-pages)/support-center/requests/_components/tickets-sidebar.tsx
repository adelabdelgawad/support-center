'use client';

import { Plus, RefreshCw, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useViewport } from '@/hooks/use-mobile';
import type { ViewItem } from '@/types/requests-list';
import { BusinessUnitFilter } from './business-unit-filter';

interface TicketsSidebarProps {
  visible: boolean;
  activeView: string;
  viewItems: ViewItem[];
  selectedBusinessUnitIds: number[];
  onViewChange: (viewName: string) => void;
  onBusinessUnitFilterChange: (ids: number[]) => void;
  onAddView?: () => void;
  onRefresh?: () => void;
  onManageViews?: () => void;
  onClose?: () => void;
  isMobile?: boolean;
  inSheet?: boolean; // True when rendered inside a Sheet component
  disabled?: boolean; // Disable all interactions (during view change)
}

/**
 * Sidebar content - shared between desktop aside and mobile Sheet
 */
function SidebarContent({
  activeView,
  viewItems,
  selectedBusinessUnitIds,
  onViewChange,
  onBusinessUnitFilterChange,
  onAddView,
  onRefresh,
  onManageViews,
  onClose,
  isMobile = false,
  inSheet = false,
  visible,
  disabled = false,
}: TicketsSidebarProps) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-auto shrink-0',
        inSheet ? 'w-full h-full bg-transparent' : 'w-full bg-card',
        !visible && !inSheet && 'hidden'
      )}
      data-debug="views-sidebar-content"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Views</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onAddView}
            disabled={disabled}
            aria-label="Add view"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onRefresh}
            disabled={disabled}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </Button>
          {/* Custom close button - shown on mobile to align with other header buttons */}
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* View List */}
      <div className="flex-1 overflow-y-auto py-2">
        {viewItems.map((item, index) => (
          <button
            key={index}
            onClick={() => !disabled && onViewChange(item.name)}
            disabled={disabled}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3 text-sm text-foreground transition-colors min-h-[48px]',
              activeView === item.name &&
                'bg-accent border-l-3 border-l-primary pl-[13px]',
              disabled
                ? 'cursor-not-allowed opacity-60'
                : 'hover:bg-accent cursor-pointer'
            )}
          >
            <span className="flex-1 text-left">{item.name}</span>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {/* Business Unit Filter */}
      <BusinessUnitFilter
        selectedIds={selectedBusinessUnitIds}
        onSelectionChange={onBusinessUnitFilterChange}
      />

      {/* Sidebar Footer */}
      <div className="border-t border-border py-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onManageViews?.();
          }}
          className="flex items-center px-4 py-3 text-sm text-primary hover:text-primary/80 min-h-[48px]"
        >
          Manage views
          <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export function TicketsSidebar({
  visible,
  activeView,
  viewItems,
  selectedBusinessUnitIds,
  onViewChange,
  onBusinessUnitFilterChange,
  onAddView,
  onRefresh,
  onManageViews,
  onClose,
  inSheet = false, // When true, component is already wrapped in a Sheet by parent
  disabled = false, // Disable all interactions (during view change)
}: TicketsSidebarProps) {
  const { isMobile } = useViewport();

  // Mobile: Render as Sheet ONLY if not already inside a Sheet wrapper
  // This prevents double Sheet nesting which causes duplicate close buttons
  if (isMobile && !inSheet) {
    // Wrap handlers to close sheet after action on mobile
    const handleViewChangeWithClose = (viewName: string) => {
      onViewChange(viewName);
      onClose?.(); // Close sheet after selecting a view
    };

    const handleBusinessUnitFilterChangeWithClose = (ids: number[]) => {
      onBusinessUnitFilterChange(ids);
      onClose?.(); // Close sheet after changing filter
    };

    return (
      <Sheet open={visible} onOpenChange={(open) => !open && onClose?.()}>
        <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 flex flex-col gap-0" hideClose={true}>
          <SheetHeader className="sr-only">
            <SheetTitle>Views & Filters</SheetTitle>
            <SheetDescription>Select a view or filter tickets</SheetDescription>
          </SheetHeader>
          <SidebarContent
            visible={visible}
            activeView={activeView}
            viewItems={viewItems}
            selectedBusinessUnitIds={selectedBusinessUnitIds}
            onViewChange={handleViewChangeWithClose}
            onBusinessUnitFilterChange={handleBusinessUnitFilterChangeWithClose}
            onAddView={onAddView}
            onRefresh={onRefresh}
            onManageViews={onManageViews}
            onClose={onClose}
            isMobile={true}
            inSheet={true}
            disabled={disabled}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // Mobile (already in Sheet) or Desktop/Tablet: Render content directly
  // When inSheet={true}, parent component manages the Sheet wrapper
  if (isMobile && inSheet) {
    return (
      <SidebarContent
        visible={visible}
        activeView={activeView}
        viewItems={viewItems}
        selectedBusinessUnitIds={selectedBusinessUnitIds}
        onViewChange={onViewChange}
        onBusinessUnitFilterChange={onBusinessUnitFilterChange}
        onAddView={onAddView}
        onRefresh={onRefresh}
        onManageViews={onManageViews}
        onClose={onClose}
        isMobile={true}
        inSheet={true}
        disabled={disabled}
      />
    );
  }

  // Desktop/Tablet: Render as aside
  return (
    <aside
      className={cn(
        'w-[274px] bg-card border-r border-border flex flex-col overflow-auto transition-[width] duration-200 ease-linear will-change-width shrink-0',
        !visible && 'w-0 border-r-0'
      )}
      data-debug="views-sidebar"
    >
      <SidebarContent
        visible={visible}
        activeView={activeView}
        viewItems={viewItems}
        selectedBusinessUnitIds={selectedBusinessUnitIds}
        onViewChange={onViewChange}
        onBusinessUnitFilterChange={onBusinessUnitFilterChange}
        onAddView={onAddView}
        onRefresh={onRefresh}
        onManageViews={onManageViews}
        isMobile={false}
        inSheet={false}
        disabled={disabled}
      />
    </aside>
  );
}
