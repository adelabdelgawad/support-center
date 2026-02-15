"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import {
  Faceted,
  FacetedTrigger,
  FacetedContent,
  FacetedInput,
  FacetedList,
  FacetedEmpty,
  FacetedGroup,
  FacetedItem,
  FacetedBadgeList,
} from "@/components/data-table";
import type { BusinessUnitCount } from "@/lib/types/api/requests";

interface BusinessUnitFilterProps {
  businessUnits: BusinessUnitCount[];
}

/**
 * Business Unit faceted multi-select filter.
 * Counts reflect the current view (e.g. unassigned tickets per BU).
 */
export function BusinessUnitFilter({ businessUnits }: BusinessUnitFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentBuIds = useMemo(() => {
    const param = searchParams?.get("business_unit_ids") || "";
    return param ? param.split(",") : [];
  }, [searchParams]);

  const options = useMemo(
    () =>
      businessUnits.map((bu) => ({
        value: bu.id.toString(),
        label: bu.name,
        count: bu.count,
      })),
    [businessUnits]
  );

  const facetedOptions = useMemo(
    () => options.map(({ value, label }) => ({ value, label })),
    [options]
  );

  const handleChange = useCallback(
    (value: string[] | undefined) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams?.toString() || "");
        params.set("page", "1");

        if (value && value.length > 0) {
          params.set("business_unit_ids", value.join(","));
        } else {
          params.delete("business_unit_ids");
        }

        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [searchParams, pathname, router]
  );

  return (
    <Faceted multiple value={currentBuIds} onValueChange={handleChange}>
      <FacetedTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 border-dashed gap-1">
          <Building2 className="size-4" />
          Business Unit
          <FacetedBadgeList
            options={facetedOptions}
            max={2}
            placeholder=""
            selectedLabel="selected"
          />
        </Button>
      </FacetedTrigger>
      <FacetedContent>
        <FacetedInput placeholder="Search units..." />
        <FacetedList>
          <FacetedEmpty>No units found.</FacetedEmpty>
          <FacetedGroup>
            {options.map((option) => (
              <FacetedItem key={option.value} value={option.value}>
                <span>{option.label}</span>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                  {option.count}
                </span>
              </FacetedItem>
            ))}
          </FacetedGroup>
        </FacetedList>
      </FacetedContent>
    </Faceted>
  );
}
