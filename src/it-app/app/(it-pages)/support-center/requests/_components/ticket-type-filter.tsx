'use client';

import { cn } from '@/lib/utils';
import { useViewport } from '@/hooks/use-mobile';

export type TicketTypeFilter = 'all' | 'parents' | 'subtasks';

interface TicketTypeFilterProps {
  activeFilter: TicketTypeFilter;
  counts: {
    all: number;
    parents: number;
    subtasks: number;
  };
  onFilterChange: (filter: TicketTypeFilter) => void;
}

export function TicketTypeFilter({ activeFilter, counts, onFilterChange }: TicketTypeFilterProps) {
  const { isMobile } = useViewport();

  const filters: Array<{ key: TicketTypeFilter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'parents', label: 'My Tasks', count: counts.parents },
    { key: 'subtasks', label: 'Subtasks', count: counts.subtasks },
  ];

  // Mobile: Segmented control with touch-friendly buttons
  if (isMobile) {
    return (
      <div className="mb-4 p-1 bg-muted/50 rounded-lg inline-flex gap-1 w-full">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => onFilterChange(filter.key)}
            className={cn(
              'flex-1 px-3 py-2.5 rounded-md text-sm font-medium transition-all',
              'min-h-[44px] flex flex-col items-center justify-center gap-0.5',
              'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              activeFilter === filter.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="text-xs font-semibold">{filter.label}</span>
            <span className="text-xs font-medium opacity-75 tabular-nums">
              {filter.count}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // Desktop: Tab-like design (original)
  return (
    <div className="flex items-center gap-1 border-b border-border mb-4">
      {filters.map((filter) => (
        <button
          key={filter.key}
          onClick={() => onFilterChange(filter.key)}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors relative',
            'hover:text-foreground',
            activeFilter === filter.key
              ? 'text-foreground'
              : 'text-muted-foreground'
          )}
        >
          <span className="flex items-center gap-2">
            {filter.label}
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium tabular-nums',
                activeFilter === filter.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {filter.count}
            </span>
          </span>
          {activeFilter === filter.key && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
