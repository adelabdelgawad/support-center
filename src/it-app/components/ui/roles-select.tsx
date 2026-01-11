'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

export interface RoleOption {
  value: string;
  label: string;
  description?: string;
}

interface RolesSelectProps {
  value: RoleOption[];
  onChange: (roles: RoleOption[]) => void;
  options: RoleOption[];
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
}

export function RolesSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select roles...',
  isLoading = false,
}: RolesSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase()) ||
    option.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (selectedValue: string) => {
    const option = options.find((opt) => opt.value === selectedValue);
    if (!option) return;

    const isSelected = value.some((v) => v.value === selectedValue);

    if (isSelected) {
      // Remove from selection
      onChange(value.filter((v) => v.value !== selectedValue));
    } else {
      // Add to selection
      onChange([...value, option]);
    }
  };

  const handleRemove = (roleValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v.value !== roleValue));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="w-full justify-between min-h-[2.75rem] h-auto"
        >
          {value.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.map((role) => (
                <Badge
                  key={role.value}
                  variant="secondary"
                  className="mr-1 mb-1"
                  onClick={(e) => {
                    if (!disabled) {
                      handleRemove(role.value, e);
                    }
                  }}
                >
                  {role.label}
                  {!disabled && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRemove(role.value, e as unknown as React.MouseEvent);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => handleRemove(role.value, e)}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start" sideOffset={5}>
        <Command shouldFilter={false} className="max-h-[400px]">
          <CommandInput
            placeholder="Search roles..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[340px]">
            <CommandEmpty>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <span className="ml-2">Loading roles...</span>
                </div>
              ) : (
                'No roles found.'
              )}
            </CommandEmpty>
            <div className="max-h-[340px] overflow-y-auto overscroll-contain" style={{ overflowY: 'auto' }}>
              <CommandGroup className="p-0">
                {filteredOptions.map((option) => {
                const isSelected = value.some((v) => v.value === option.value);

                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <div
                      className={cn(
                        'h-4 w-4 border rounded-sm flex items-center justify-center',
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-input'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
              </CommandGroup>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
