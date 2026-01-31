"use client";

import { formatDate } from "@/lib/utils/date-formatting";

interface PeriodIndicatorProps {
  periodStart: string;
  periodEnd: string;
  comparisonPeriodStart?: string;
  comparisonPeriodEnd?: string;
}

/**
 * Standardized period display for reports
 */
export function PeriodIndicator({
  periodStart,
  periodEnd,
  comparisonPeriodStart,
  comparisonPeriodEnd,
}: PeriodIndicatorProps) {
  return (
    <div className="text-sm text-muted-foreground">
      Period: {formatDate(periodStart)} - {formatDate(periodEnd)}
      {comparisonPeriodStart && (
        <span className="ml-2">
          (compared to {formatDate(comparisonPeriodStart)} -{" "}
          {formatDate(comparisonPeriodEnd!)})
        </span>
      )}
    </div>
  );
}
