'use client';

import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useRequestsListCounts } from '../_context/requests-list-counts-context';

interface BusinessUnit {
  id: number;
  name: string;
  count: number;
}

interface BusinessUnitFilterProps {
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

export function BusinessUnitFilter({
  selectedIds,
  onSelectionChange,
}: BusinessUnitFilterProps) {
  // Use data from context instead of fetching independently
  const { allBusinessUnits, isBusinessUnitsValidating } = useRequestsListCounts();

  const [isExpanded, setIsExpanded] = useState(false);

  const businessUnits = allBusinessUnits;
  const isLoading = isBusinessUnitsValidating && businessUnits.length === 0;

  const handleToggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>Loading filters...</span>
        </div>
      </div>
    );
  }

  if (businessUnits.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>Business Units</span>
          {selectedIds.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {selectedIds.length}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expandable Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isExpanded ? 'max-h-[300px]' : 'max-h-0'
        )}
      >
        {/* Clear All Button */}
        {selectedIds.length > 0 && (
          <div className="px-4 pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          </div>
        )}

        {/* Business Unit List */}
        <div className="max-h-[250px] overflow-y-auto px-2 pb-2">
          {businessUnits.map((bu) => (
            <label
              key={bu.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <Checkbox
                checked={selectedIds.includes(bu.id)}
                onCheckedChange={() => handleToggle(bu.id)}
              />
              <span className="flex-1 text-sm text-foreground truncate">
                {bu.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {bu.count}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
