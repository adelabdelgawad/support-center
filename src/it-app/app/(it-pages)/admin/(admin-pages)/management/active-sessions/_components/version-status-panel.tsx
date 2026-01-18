"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusCircle } from "@/components/data-table";
import type { VersionStatusMetrics } from "@/types/sessions";

interface VersionStatusPanelProps {
  versionMetrics: VersionStatusMetrics;
}

/**
 * Status panel for Version Status
 * Shows version status metrics only (session counts moved to table header)
 */
export function VersionStatusPanel({
  versionMetrics,
}: VersionStatusPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Version status - calculate OK percentage for the ring
  const okPercentage = versionMetrics.total > 0
    ? (versionMetrics.ok / versionMetrics.total) * 100
    : 0;

  return (
    <div
      className={`bg-card shadow-lg h-full flex flex-col transition-all duration-300 relative min-h-0 ${
        isExpanded ? "w-64" : "w-16"
      }`}
    >
      {/* Toggle Arrow Button */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 z-20 transition-all ${
          isExpanded ? "-right-3" : "left-0"
        }`}
      >
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          size="icon"
          variant="ghost"
          className="w-6 h-12 rounded-md bg-card hover:bg-accent transition-all p-0 border border-border shadow-sm"
        >
          {isExpanded ? (
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4">
        {isExpanded ? (
          <>
            {/* Version Status Section */}
            <div className="px-2 py-4">
              <div className="flex flex-col items-center">
                <StatusCircle
                  count={versionMetrics.total}
                  color="#3b82f6"
                  label="All Versions"
                  size="lg"
                  icon={Package}
                  showLabel={true}
                  percentage={okPercentage}
                  statusValue="all"
                  queryParam="version_status"
                />
              </div>
            </div>
            <div className="px-2 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <StatusCircle
                  count={versionMetrics.ok}
                  color="#22c55e"
                  label="Up to date"
                  size="sm"
                  statusValue="ok"
                  queryParam="version_status"
                />
                <StatusCircle
                  count={versionMetrics.outdated}
                  color="#eab308"
                  label="Outdated"
                  size="sm"
                  statusValue="outdated"
                  queryParam="version_status"
                />
                <StatusCircle
                  count={versionMetrics.outdatedEnforced}
                  color="#dc2626"
                  label="Enforced"
                  size="sm"
                  statusValue="outdated_enforced"
                  queryParam="version_status"
                />
                <StatusCircle
                  count={versionMetrics.unknown}
                  color="#6b7280"
                  label="Unknown"
                  size="sm"
                  statusValue="unknown"
                  queryParam="version_status"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Collapsed Version Status */}
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={versionMetrics.ok}
                color="#22c55e"
                label="Up to date"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="ok"
                queryParam="version_status"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={versionMetrics.outdated}
                color="#eab308"
                label="Outdated"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="outdated"
                queryParam="version_status"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={versionMetrics.outdatedEnforced}
                color="#dc2626"
                label="Update Required"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="outdated_enforced"
                queryParam="version_status"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={versionMetrics.unknown}
                color="#6b7280"
                label="Unknown"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="unknown"
                queryParam="version_status"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
