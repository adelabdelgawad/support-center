"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { DateRangePreset } from "@/types/reports";
import { DATE_RANGE_OPTIONS } from "../constants";

interface DateRangeSelectProps {
  value: DateRangePreset;
  onChange: (value: DateRangePreset) => void;
}

/**
 * Reusable date range selector for reports
 */
export function DateRangeSelect({ value, onChange }: DateRangeSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select period" />
      </SelectTrigger>
      <SelectContent>
        {DATE_RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
