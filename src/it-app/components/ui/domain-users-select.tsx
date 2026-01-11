'use client';

import { useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
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

export interface DomainUserOption {
  value: string;
  label: string;
  user: {
    id: number;
    username: string;
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
  };
}

interface DomainUsersSelectProps {
  value: DomainUserOption | null;
  onChange: (user: DomainUserOption | null) => void;
  options: DomainUserOption[];
  disabled?: boolean;
  placeholder?: string;
  isLoading?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export function DomainUsersSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select a user...',
  isLoading = false,
  searchValue = '',
  onSearchChange,
}: DomainUsersSelectProps) {
  const [open, setOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState(searchValue);
  const listRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const target = listRef.current;
    if (!target) return;

    e.stopPropagation();
    target.scrollTop += e.deltaY;
  };

  const handleSearchChange = (newValue: string) => {
    setInternalSearch(newValue);
    onSearchChange?.(newValue);
  };

  const handleSelect = (selectedValue: string) => {
    const option = options.find((opt) => opt.value === selectedValue);
    if (!option) return;

    if (value?.value === selectedValue) {
      // Deselect if clicking the same user
      onChange(null);
    } else {
      // Select the user
      onChange(option);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="w-full justify-between min-h-[2.75rem]"
        >
          {value ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                <span className="text-sm font-medium text-primary">
                  {(value.user.fullName || value.user.username)
                    ?.charAt(0)
                    .toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="font-medium truncate">
                  {value.user.fullName || value.user.username}
                </div>
                {value.user.title && (
                  <div className="text-xs text-muted-foreground truncate">
                    {value.user.title}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0" align="start" sideOffset={5}>
        <Command shouldFilter={false} className="max-h-[400px]">
          <CommandInput
            placeholder="Search by name, username, or email..."
            value={internalSearch}
            onValueChange={handleSearchChange}
          />
          <div
            ref={listRef}
            onWheel={handleWheel}
            className="max-h-[340px] overflow-y-auto overscroll-contain"
          >
            <CommandList>
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Loading users...</span>
                  </div>
                ) : (
                  'No users found.'
                )}
              </CommandEmpty>
              <CommandGroup className="p-0">
                {options.map((option) => {
                  const isSelected = value?.value === option.value;
                  const displayName = option.user.fullName || option.user.username;

                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => handleSelect(option.value)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-sm font-medium text-primary">
                            {displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{displayName}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {option.user.username}
                            {option.user.email && ` • ${option.user.email}`}
                            {option.user.title && ` • ${option.user.title}`}
                          </div>
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
