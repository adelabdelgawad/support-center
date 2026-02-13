"use client";

import { useCallback, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FilterOption {
  label: string;
  value: string;
}

interface AuditFacetedFilterProps {
  title: string;
  urlParam: string;
  options: FilterOption[];
}

export function AuditFacetedFilter({
  title,
  urlParam,
  options,
}: AuditFacetedFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const currentValue = searchParams?.get(urlParam) || "";
  const selectedLabel = options.find((o) => o.value === currentValue)?.label;

  const filteredOptions = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleSelect = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("page", "1");

      if (value === currentValue) {
        params.delete(urlParam);
      } else {
        params.set(urlParam, value);
      }

      router.push(`${pathname}?${params.toString()}`);
      setOpen(false);
      setSearch("");
    },
    [router, pathname, searchParams, urlParam, currentValue]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 border-dashed text-xs",
            currentValue && "border-primary/50 bg-primary/5"
          )}
        >
          <ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" />
          {title}
          {selectedLabel && (
            <Badge
              variant="secondary"
              className="ml-1.5 px-1.5 py-0 text-[10px] rounded-sm font-normal"
            >
              {selectedLabel}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder={`Search ${title.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filteredOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No results.</p>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = currentValue === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "flex items-center w-full rounded-sm px-2 py-1.5 text-xs cursor-pointer",
                    "hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
