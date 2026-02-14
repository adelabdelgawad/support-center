"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section } from "@/lib/api/sections";
import type { Section } from "@/types/api/sections";

interface SectionsSelectProps {
  value?: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

export function SectionsSelect({ value, onChange, disabled = false }: SectionsSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger placeholder="Select a section..." />
      <SelectValue placeholder="Select a section..." />
      <SelectContent>
        {Sections.map((section) => (
          <SelectItem key={section.id} value={section.id}>
            {section.shownNameEn}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
