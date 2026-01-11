'use client';

import { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DateRangePreset } from '@/types/reports';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DateRangePickerProps {
  preset: DateRangePreset;
  customStartDate?: string;
  customEndDate?: string;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomRangeChange: (startDate: string, endDate: string) => void;
}

const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

export function DateRangePicker({
  preset,
  customStartDate,
  customEndDate,
  onPresetChange,
  onCustomRangeChange,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    customStartDate ? new Date(customStartDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    customEndDate ? new Date(customEndDate) : undefined
  );

  const handlePresetChange = (value: DateRangePreset) => {
    onPresetChange(value);
  };

  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    if (date && endDate) {
      onCustomRangeChange(
        format(date, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd')
      );
    }
  };

  const handleEndDateChange = (date: Date | undefined) => {
    setEndDate(date);
    if (startDate && date) {
      onCustomRangeChange(
        format(startDate, 'yyyy-MM-dd'),
        format(date, 'yyyy-MM-dd')
      );
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">Date Range:</label>
        <Select value={preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESET_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === 'custom' && (
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-[200px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, 'PPP') : 'Pick start date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={handleStartDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className="text-sm text-muted-foreground">to</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-[200px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, 'PPP') : 'Pick end date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={handleEndDateChange}
                initialFocus
                disabled={(date) =>
                  startDate ? date < startDate : false
                }
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
