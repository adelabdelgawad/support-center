"use client";

import {
  DynamicTableBar,
} from "@/components/data-table";

/**
 * Header section of the business units table (now just a placeholder/title area)
 */
export function BusinessUnitsTableHeader() {
  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="header"
        left={<h1 className="text-xl font-semibold">Business Units</h1>}
        right={<></>}
      />
    </div>
  );
}
