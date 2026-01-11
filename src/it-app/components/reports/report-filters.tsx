'use client';

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Filter } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FilterOption {
  id: number;
  name: string;
  nameEn?: string;
}

interface ReportFiltersProps {
  businessUnits?: FilterOption[];
  technicians?: FilterOption[];
  priorities?: FilterOption[];
  statuses?: FilterOption[];
  selectedBusinessUnitIds?: number[];
  selectedTechnicianIds?: string[];
  selectedPriorityIds?: number[];
  selectedStatusIds?: number[];
  onFiltersChange: (filters: {
    businessUnitIds?: number[];
    technicianIds?: string[];
    priorityIds?: number[];
    statusIds?: number[];
  }) => void;
}

export function ReportFilters({
  businessUnits = [],
  technicians = [],
  priorities = [],
  statuses = [],
  selectedBusinessUnitIds = [],
  selectedTechnicianIds = [],
  selectedPriorityIds = [],
  selectedStatusIds = [],
  onFiltersChange,
}: ReportFiltersProps) {
  const [localBusinessUnits, setLocalBusinessUnits] = useState<number[]>(selectedBusinessUnitIds);
  const [localTechnicians, setLocalTechnicians] = useState<string[]>(selectedTechnicianIds);
  const [localPriorities, setLocalPriorities] = useState<number[]>(selectedPriorityIds);
  const [localStatuses, setLocalStatuses] = useState<number[]>(selectedStatusIds);

  const hasActiveFilters =
    localBusinessUnits.length > 0 ||
    localTechnicians.length > 0 ||
    localPriorities.length > 0 ||
    localStatuses.length > 0;

  const handleApplyFilters = () => {
    onFiltersChange({
      businessUnitIds: localBusinessUnits.length > 0 ? localBusinessUnits : undefined,
      technicianIds: localTechnicians.length > 0 ? localTechnicians : undefined,
      priorityIds: localPriorities.length > 0 ? localPriorities : undefined,
      statusIds: localStatuses.length > 0 ? localStatuses : undefined,
    });
  };

  const handleClearFilters = () => {
    setLocalBusinessUnits([]);
    setLocalTechnicians([]);
    setLocalPriorities([]);
    setLocalStatuses([]);
    onFiltersChange({});
  };

  const toggleItem = <T extends string | number>(
    items: T[],
    setItems: (items: T[]) => void,
    id: T
  ) => {
    if (items.includes(id)) {
      setItems(items.filter((item) => item !== id));
    } else {
      setItems([...items, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">
                {localBusinessUnits.length +
                  localTechnicians.length +
                  localPriorities.length +
                  localStatuses.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px]" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Report Filters</h4>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                >
                  Clear all
                </Button>
              )}
            </div>

            {businessUnits.length > 0 && (
              <div className="space-y-2">
                <Label>Business Units</Label>
                <ScrollArea className="h-[150px] border rounded-md p-2">
                  {businessUnits.map((bu) => (
                    <div key={bu.id} className="flex items-center space-x-2 py-1">
                      <Checkbox
                        id={`bu-${bu.id}`}
                        checked={localBusinessUnits.includes(bu.id)}
                        onCheckedChange={() =>
                          toggleItem(localBusinessUnits, setLocalBusinessUnits, bu.id)
                        }
                      />
                      <label
                        htmlFor={`bu-${bu.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {bu.nameEn || bu.name}
                      </label>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}

            {technicians.length > 0 && (
              <div className="space-y-2">
                <Label>Technicians</Label>
                <ScrollArea className="h-[150px] border rounded-md p-2">
                  {technicians.map((tech) => (
                    <div key={tech.id} className="flex items-center space-x-2 py-1">
                      <Checkbox
                        id={`tech-${tech.id}`}
                        checked={localTechnicians.includes(String(tech.id))}
                        onCheckedChange={() =>
                          toggleItem(localTechnicians, setLocalTechnicians, String(tech.id))
                        }
                      />
                      <label
                        htmlFor={`tech-${tech.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {tech.name}
                      </label>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}

            {priorities.length > 0 && (
              <div className="space-y-2">
                <Label>Priorities</Label>
                <div className="space-y-1">
                  {priorities.map((priority) => (
                    <div key={priority.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`priority-${priority.id}`}
                        checked={localPriorities.includes(priority.id)}
                        onCheckedChange={() =>
                          toggleItem(localPriorities, setLocalPriorities, priority.id)
                        }
                      />
                      <label
                        htmlFor={`priority-${priority.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {priority.nameEn || priority.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {statuses.length > 0 && (
              <div className="space-y-2">
                <Label>Statuses</Label>
                <ScrollArea className="h-[100px] border rounded-md p-2">
                  {statuses.map((status) => (
                    <div key={status.id} className="flex items-center space-x-2 py-1">
                      <Checkbox
                        id={`status-${status.id}`}
                        checked={localStatuses.includes(status.id)}
                        onCheckedChange={() =>
                          toggleItem(localStatuses, setLocalStatuses, status.id)
                        }
                      />
                      <label
                        htmlFor={`status-${status.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {status.nameEn || status.name}
                      </label>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                Clear
              </Button>
              <Button size="sm" onClick={handleApplyFilters}>
                Apply Filters
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1">
          {localBusinessUnits.map((id) => {
            const bu = businessUnits.find((b) => b.id === id);
            return (
              <Badge key={`bu-${id}`} variant="secondary" className="gap-1">
                {bu?.nameEn || bu?.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    const newIds = localBusinessUnits.filter((i) => i !== id);
                    setLocalBusinessUnits(newIds);
                  }}
                />
              </Badge>
            );
          })}
          {localTechnicians.map((id) => {
            const tech = technicians.find((t) => t.id === parseInt(id, 10));
            return (
              <Badge key={`tech-${id}`} variant="secondary" className="gap-1">
                {tech?.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    const newIds = localTechnicians.filter((i) => i !== id);
                    setLocalTechnicians(newIds);
                  }}
                />
              </Badge>
            );
          })}
          {localPriorities.map((id) => {
            const priority = priorities.find((p) => p.id === id);
            return (
              <Badge key={`priority-${id}`} variant="secondary" className="gap-1">
                {priority?.nameEn || priority?.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    const newIds = localPriorities.filter((i) => i !== id);
                    setLocalPriorities(newIds);
                  }}
                />
              </Badge>
            );
          })}
          {localStatuses.map((id) => {
            const status = statuses.find((s) => s.id === id);
            return (
              <Badge key={`status-${id}`} variant="secondary" className="gap-1">
                {status?.nameEn || status?.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => {
                    const newIds = localStatuses.filter((i) => i !== id);
                    setLocalStatuses(newIds);
                  }}
                />
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
